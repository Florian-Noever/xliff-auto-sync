import * as assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import pkg from '../../../package.json';
import type { GitExtension, Repository } from '../../types/git';

const EXTENSION_ID = `${pkg.publisher}.${pkg.name}`;
const COMMAND_COMMIT_TRANSLATIONS = pkg.contributes.commands[0].command;
const FAKE_SYNC_COMMAND = 'xliffAutoSync.test.fakeSync';
const TRANSLATION_COMMIT_MESSAGE = 'Xliff Translations';

const BASE_XLIFF = 'Translations/App.g.xlf';
const TARGET_XLIFF = 'Translations/App.de-DE.xlf';
const NEW_XLIFF = 'Translations/App.fr-FR.xlf';
const SOURCE_FILE = 'src/App.txt';

// Long enough for an unwanted, asynchronously started sync to show up
const SETTLE_DELAY = 1000;

// Set by runTests.ts, which removes the folder after VS Code has exited
const FIXTURES_PATH = process.env.XLIFF_AUTO_SYNC_FIXTURES;

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(description: string, condition: () => boolean | Promise<boolean>, timeout = 10_000): Promise<void> {
    const deadline = Date.now() + timeout;
    while (!await condition()) {
        if (Date.now() > deadline) {
            throw new Error(`Timed out waiting for ${description}.`);
        }
        await delay(100);
    }
}

function git(cwd: string, ...args: string[]): string {
    return cp.execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
}

function xliff(targetLanguage: string): string {
    return [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">',
        `  <file datatype="xml" source-language="en-US" target-language="${targetLanguage}" original="App">`,
        '    <body />',
        '  </file>',
        '</xliff>',
        '',
    ].join('\n');
}

suite('XLIFF sync flow', () => {
    let tempDir: string | undefined;
    let repoPath: string;
    let remotePath: string;
    let repository: Repository;
    let fakeSyncCommand: vscode.Disposable | undefined;
    let syncCalls = 0;
    let syncAction: () => void;

    const extensionConfiguration = () => vscode.workspace.getConfiguration('xliffAutoSync');
    const gitConfiguration = () => vscode.workspace.getConfiguration('git');

    function writeFile(relativePath: string, content: string): void {
        const filePath = path.join(repoPath, relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content);
    }

    function appendLine(relativePath: string): void {
        fs.appendFileSync(path.join(repoPath, relativePath), `<!-- ${Date.now()} -->\n`);
    }

    function deleteFile(relativePath: string): void {
        fs.rmSync(path.join(repoPath, relativePath));
    }

    function isInHead(relativePath: string): boolean {
        try {
            git(repoPath, 'cat-file', '-e', `HEAD:${relativePath}`);
            return true;
        } catch {
            return false;
        }
    }

    function lastCommitMessages(count: number): string[] {
        return git(repoPath, 'log', `-${count}`, '--format=%s').split('\n');
    }

    function committedFiles(): string[] {
        return git(repoPath, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD').split('\n').sort();
    }

    // Created with the git CLI before the Git extension opens the repository
    function createFixture(root: string): void {
        const hooksPath = path.join(root, 'hooks');
        fs.mkdirSync(hooksPath);
        git(root, 'init', '--quiet', '--bare', remotePath);
        git(root, 'init', '--quiet', repoPath);
        git(repoPath, 'symbolic-ref', 'HEAD', 'refs/heads/main');
        git(repoPath, 'config', 'user.name', 'XLIFF Auto Sync Tests');
        git(repoPath, 'config', 'user.email', 'tests@xliff-auto-sync.invalid');
        git(repoPath, 'config', 'commit.gpgsign', 'false');
        git(repoPath, 'config', 'core.hooksPath', hooksPath);

        writeFile(BASE_XLIFF, xliff('en-US'));
        writeFile(TARGET_XLIFF, xliff('de-DE'));
        writeFile(SOURCE_FILE, 'Initial content\n');
        git(repoPath, 'add', '.');
        git(repoPath, 'commit', '--quiet', '-m', 'Initial commit');
        git(repoPath, 'remote', 'add', 'origin', remotePath);
        git(repoPath, 'push', '--quiet', '-u', 'origin', 'main');
    }

    // After the fixture is opened, all writes go through the Git API to avoid index.lock races with the Git extension
    async function discardChanges(relativePath: string): Promise<void> {
        const filePath = path.join(repoPath, relativePath);
        await repository.revert([filePath]);
        await repository.clean([filePath]);
    }

    suiteSetup(async () => {
        await vscode.extensions.getExtension(EXTENSION_ID)!.activate();
        const gitApi = vscode.extensions.getExtension<GitExtension>('vscode.git')!.exports.getAPI(1);
        await waitFor('the Git API to initialize', () => gitApi.state === 'initialized');

        tempDir = fs.realpathSync.native(fs.mkdtempSync(path.join(FIXTURES_PATH ?? os.tmpdir(), 'xliff-auto-sync-fixture-')));
        repoPath = path.join(tempDir, 'repo');
        remotePath = path.join(tempDir, 'remote.git');
        createFixture(tempDir);

        const openedRepository = await gitApi.openRepository(vscode.Uri.file(repoPath));
        assert.ok(openedRepository, `The Git extension did not open the fixture repository at ${repoPath}`);
        repository = openedRepository;
        await repository.status();

        fakeSyncCommand = vscode.commands.registerCommand(FAKE_SYNC_COMMAND, () => {
            syncCalls++;
            syncAction();
        });
        await extensionConfiguration().update('syncCommand', FAKE_SYNC_COMMAND, vscode.ConfigurationTarget.Global);
        await gitConfiguration().update('untrackedChanges', 'separate', vscode.ConfigurationTarget.Global);
    });

    suiteTeardown(async () => {
        fakeSyncCommand?.dispose();
        // Global settings persist in .vscode-test/user-data across test runs
        await extensionConfiguration().update('syncCommand', undefined, vscode.ConfigurationTarget.Global);
        await extensionConfiguration().update('pushAfterCommit', undefined, vscode.ConfigurationTarget.Global);
        await gitConfiguration().update('untrackedChanges', undefined, vscode.ConfigurationTarget.Global);
        // Best effort when not started by runTests.ts (e.g. from the Test Explorer): on Windows, VS Code may still lock the fixture
        if (tempDir && !FIXTURES_PATH) {
            await vscode.commands.executeCommand('git.close', vscode.Uri.file(repoPath));
            try {
                fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
            } catch (e) {
                console.warn(`Could not remove the test fixture at ${tempDir}: ${e}`);
            }
        }
    });

    setup(async () => {
        syncAction = () => appendLine(TARGET_XLIFF);
        await repository.status();
    });

    test('the command commits only XLIFF changes, including new files', async () => {
        syncAction = () => {
            appendLine(TARGET_XLIFF);
            writeFile(NEW_XLIFF, xliff('fr-FR'));
        };
        appendLine(SOURCE_FILE);
        const callsBefore = syncCalls;

        await vscode.commands.executeCommand(COMMAND_COMMIT_TRANSLATIONS);
        await delay(SETTLE_DELAY);

        assert.strictEqual(syncCalls - callsBefore, 1, 'the sync command should run exactly once');
        assert.deepStrictEqual(lastCommitMessages(2), [TRANSLATION_COMMIT_MESSAGE, 'Initial commit']);
        assert.deepStrictEqual(committedFiles(), [NEW_XLIFF, TARGET_XLIFF].sort());
        await discardChanges(SOURCE_FILE);
    });

    test('a commit made in VS Code triggers exactly one sync and translation commit', async () => {
        appendLine(SOURCE_FILE);
        await repository.add([path.join(repoPath, SOURCE_FILE)]);
        const callsBefore = syncCalls;

        await repository.commit('Change source');
        await waitFor('the translation commit', () => lastCommitMessages(1)[0] === TRANSLATION_COMMIT_MESSAGE);
        await delay(SETTLE_DELAY);

        assert.strictEqual(syncCalls - callsBefore, 1, 'the sync command should run exactly once');
        assert.deepStrictEqual(lastCommitMessages(2), [TRANSLATION_COMMIT_MESSAGE, 'Change source']);
        assert.deepStrictEqual(committedFiles(), [TARGET_XLIFF]);
    });

    test('staged non-XLIFF changes block the sync', async () => {
        appendLine(SOURCE_FILE);
        await repository.add([path.join(repoPath, SOURCE_FILE)]);
        const headBefore = git(repoPath, 'rev-parse', 'HEAD');
        const callsBefore = syncCalls;

        await vscode.commands.executeCommand(COMMAND_COMMIT_TRANSLATIONS);
        await delay(SETTLE_DELAY);

        assert.strictEqual(syncCalls - callsBefore, 0, 'the sync command should not run');
        assert.strictEqual(git(repoPath, 'rev-parse', 'HEAD'), headBefore);
        await discardChanges(SOURCE_FILE);
    });

    test('a failed commit does not trigger a sync', async () => {
        const callsBefore = syncCalls;

        await assert.rejects(repository.commit('Nothing to commit'));
        await delay(SETTLE_DELAY);

        assert.strictEqual(syncCalls - callsBefore, 0, 'the sync command should not run');
    });

    test('a translation file deleted by the sync is not committed', async () => {
        syncAction = () => {
            deleteFile(TARGET_XLIFF);
            appendLine(NEW_XLIFF);
        };

        await vscode.commands.executeCommand(COMMAND_COMMIT_TRANSLATIONS);
        await delay(SETTLE_DELAY);

        assert.deepStrictEqual(lastCommitMessages(1), [TRANSLATION_COMMIT_MESSAGE]);
        assert.deepStrictEqual(committedFiles(), [NEW_XLIFF]);
        assert.ok(isInHead(TARGET_XLIFF), 'the deleted translation file should still be in HEAD');
        await discardChanges(TARGET_XLIFF);
    });

    test('nothing is committed when the sync only deletes translation files', async () => {
        syncAction = () => deleteFile(TARGET_XLIFF);
        const headBefore = git(repoPath, 'rev-parse', 'HEAD');
        const callsBefore = syncCalls;

        await vscode.commands.executeCommand(COMMAND_COMMIT_TRANSLATIONS);
        await delay(SETTLE_DELAY);

        assert.strictEqual(syncCalls - callsBefore, 1, 'the sync command should run exactly once');
        assert.strictEqual(git(repoPath, 'rev-parse', 'HEAD'), headBefore);
        assert.ok(isInHead(TARGET_XLIFF), 'the deleted translation file should still be in HEAD');
        await discardChanges(TARGET_XLIFF);
    });

    test('a staged deletion of a translation file blocks the sync', async () => {
        deleteFile(TARGET_XLIFF);
        await repository.add([path.join(repoPath, TARGET_XLIFF)]);
        const headBefore = git(repoPath, 'rev-parse', 'HEAD');
        const callsBefore = syncCalls;

        await vscode.commands.executeCommand(COMMAND_COMMIT_TRANSLATIONS);
        await delay(SETTLE_DELAY);

        assert.strictEqual(syncCalls - callsBefore, 0, 'the sync command should not run');
        assert.strictEqual(git(repoPath, 'rev-parse', 'HEAD'), headBefore);
        await discardChanges(TARGET_XLIFF);
    });

    test('pushes only branches that track an upstream branch', async () => {
        await extensionConfiguration().update('pushAfterCommit', 'always', vscode.ConfigurationTarget.Global);

        await vscode.commands.executeCommand(COMMAND_COMMIT_TRANSLATIONS);
        assert.strictEqual(git(remotePath, 'rev-parse', 'main'), git(repoPath, 'rev-parse', 'HEAD'), 'main should be pushed');

        await repository.createBranch('feature', true);
        await repository.status();
        await vscode.commands.executeCommand(COMMAND_COMMIT_TRANSLATIONS);

        assert.deepStrictEqual(lastCommitMessages(1), [TRANSLATION_COMMIT_MESSAGE]);
        assert.throws(() => git(remotePath, 'rev-parse', '--verify', '--quiet', 'refs/heads/feature'), 'the feature branch should not be pushed');
    });
});
