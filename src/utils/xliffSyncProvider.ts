import * as vscode from 'vscode';
import { MANIFEST } from '../extension';
import type { Repository } from '../types/git';
import { getConfiguration } from './configuration';
import { wrapError } from './errors';
import { getGitApi, getRepositoryKey } from './gitUtils';
import { Logger } from './logger';
import { collectXliffPaths, getNonXliffPaths } from './xliffUtils';

const COMMIT_MESSAGE = 'Xliff Translations';
const XLIFF_FILES_GLOB = '**/*.{xlf,xliff}';
const STATUS_BAR_MESSAGE_TIMEOUT = 3000;

interface SyncOptions {
    manual: boolean;
}

interface WatchedRepository {
    disposables: vscode.Disposable[];
    headKnown: boolean;
    headCommit: string | undefined;
    headMoved: boolean;
}

export class XliffSyncProvider implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private readonly watchedRepositories = new Map<string, WatchedRepository>();
    private readonly xliffRepositories = new Set<string>();
    private readonly running = new Set<string>();

    constructor() {
        const gitApi = getGitApi();
        if (!gitApi) {
            Logger.warn('Git API not available; translations will not be synced after commits.');
            return;
        }

        for (const repository of gitApi.repositories) {
            this.watchRepository(repository);
        }
        this.disposables.push(
            gitApi.onDidOpenRepository((repository) => this.watchRepository(repository)),
            gitApi.onDidCloseRepository((repository) => this.unwatchRepository(repository))
        );
    }

    dispose(): void {
        for (const watched of this.watchedRepositories.values()) {
            disposeAll(watched.disposables);
        }
        this.watchedRepositories.clear();
        disposeAll(this.disposables);
    }

    async syncAndCommit(repository: Repository, options: SyncOptions): Promise<void> {
        const key = getRepositoryKey(repository);
        if (this.running.has(key)) {
            Logger.debug(`Sync already running for ${repository.rootUri.fsPath}; skipping.`);
            return;
        }

        this.running.add(key);
        try {
            await this.sync(repository, options);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            Logger.error(message);
            vscode.window.showErrorMessage(`${MANIFEST.displayName}: ${message}`);
        } finally {
            this.running.delete(key);
        }
    }

    private watchRepository(repository: Repository): void {
        const key = getRepositoryKey(repository);
        if (this.watchedRepositories.has(key)) {
            return;
        }

        const head = repository.state.HEAD;
        const watched: WatchedRepository = {
            disposables: [],
            headKnown: head !== undefined,
            headCommit: head?.commit,
            headMoved: false,
        };
        watched.disposables.push(
            repository.state.onDidChange(() => this.trackHead(repository, watched)),
            repository.onDidCheckout(() => {
                watched.headMoved = false;
            }),
            repository.onDidCommit(() => this.onDidCommit(repository, watched))
        );
        this.watchedRepositories.set(key, watched);
        Logger.info(`Watching repository: ${repository.rootUri.fsPath}`);
    }

    private unwatchRepository(repository: Repository): void {
        const key = getRepositoryKey(repository);
        const watched = this.watchedRepositories.get(key);
        if (!watched) {
            return;
        }

        disposeAll(watched.disposables);
        this.watchedRepositories.delete(key);
        this.xliffRepositories.delete(key);
        Logger.info(`Stopped watching repository: ${repository.rootUri.fsPath}`);
    }

    // `onDidCommit` also fires for failed commits, and by the time it fires HEAD already points to the new commit.
    // Recording the HEAD move here (the git extension refreshes the state before firing `onDidCommit`)
    // is what lets `onDidCommit` tell a new commit from a failed one.
    private trackHead(repository: Repository, watched: WatchedRepository): void {
        const head = repository.state.HEAD;
        if (!head) {
            return;
        }

        if (watched.headKnown && head.commit !== watched.headCommit) {
            watched.headMoved = true;
        }
        watched.headKnown = true;
        watched.headCommit = head.commit;
    }

    private onDidCommit(repository: Repository, watched: WatchedRepository): void {
        const headMoved = watched.headMoved;
        watched.headMoved = false;

        // Our own translation commit fires this event synchronously, while its sync is still running
        if (this.running.has(getRepositoryKey(repository))) {
            return;
        }
        if (!headMoved) {
            Logger.debug(`Commit in ${repository.rootUri.fsPath} did not create a new commit; skipping.`);
            return;
        }

        void this.syncAndCommit(repository, { manual: false });
    }

    private async sync(repository: Repository, { manual }: SyncOptions): Promise<void> {
        if (!manual && !await this.containsXliffFiles(repository)) {
            Logger.debug(`No XLIFF files in ${repository.rootUri.fsPath}; skipping.`);
            return;
        }

        const configuration = getConfiguration(repository.rootUri);
        const syncCommand = configuration.syncCommand;
        if (!syncCommand) {
            throw new Error('No sync command configured.');
        }
        const commit = manual || configuration.commitAfterSync === 'always';
        const push = configuration.pushAfterCommit === 'always';

        // Skip the (potentially expensive) sync when its result could not be committed anyway
        const blocker = commit ? getCommitBlocker(repository) : undefined;
        if (blocker) {
            showWarning(`${blocker} Translations were not synced.`);
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Window,
                title: MANIFEST.displayName,
            },
            async (progress) => {
                progress.report({ message: 'Syncing translations' });
                await runSyncCommand(syncCommand);

                await repository.status();
                const state = repository.state;
                const xliffPaths = collectXliffPaths([...state.workingTreeChanges, ...state.untrackedChanges, ...state.indexChanges]);
                if (xliffPaths.length === 0) {
                    showStatus('No translation changes to commit.');
                    return;
                }
                if (!commit) {
                    showStatus('Translations synced.');
                    return;
                }

                const lateBlocker = getCommitBlocker(repository);
                if (lateBlocker) {
                    showWarning(`${lateBlocker} Translations were synced but not committed.`);
                    return;
                }

                progress.report({ message: 'Committing translations' });
                await commitTranslations(repository, xliffPaths);
                showStatus('Committed translation changes.');

                if (push) {
                    progress.report({ message: 'Pushing' });
                    if (await pushBranch(repository)) {
                        showStatus('Pushed translation changes.');
                    }
                }
            }
        );
    }

    private async containsXliffFiles(repository: Repository): Promise<boolean> {
        const key = getRepositoryKey(repository);
        if (this.xliffRepositories.has(key)) {
            return true;
        }

        const files = await vscode.workspace.findFiles(new vscode.RelativePattern(repository.rootUri, XLIFF_FILES_GLOB), undefined, 1);
        if (files.length === 0) {
            return false;
        }
        this.xliffRepositories.add(key);
        return true;
    }
}

function getCommitBlocker(repository: Repository): string | undefined {
    const state = repository.state;
    if (state.rebaseCommit) {
        return 'A rebase is in progress.';
    }
    if (state.mergeChanges.length > 0) {
        return 'There are unresolved merge conflicts.';
    }
    const stagedCount = getNonXliffPaths(state.indexChanges).length;
    return stagedCount > 0 ? `${stagedCount} non-XLIFF file(s) are staged.` : undefined;
}

async function runSyncCommand(command: string): Promise<void> {
    try {
        await vscode.commands.executeCommand(command);
    } catch (e) {
        wrapError(`Sync command "${command}"`, e);
    }
}

async function commitTranslations(repository: Repository, paths: string[]): Promise<void> {
    try {
        await repository.add(paths);
        await repository.commit(COMMIT_MESSAGE);
    } catch (e) {
        wrapError('Commit', e);
    }
}

async function pushBranch(repository: Repository): Promise<boolean> {
    const head = repository.state.HEAD;
    if (!head?.upstream) {
        showWarning(`Branch "${head?.name ?? 'HEAD'}" has no upstream branch; skipped push.`);
        return false;
    }

    try {
        await repository.push();
    } catch (e) {
        wrapError('Push', e);
    }
    return true;
}

function showStatus(message: string): void {
    Logger.info(message);
    vscode.window.setStatusBarMessage(`${MANIFEST.displayName}: ${message}`, STATUS_BAR_MESSAGE_TIMEOUT);
}

// Not awaited: awaiting a notification blocks until the user dismisses it
function showWarning(message: string): void {
    Logger.warn(message);
    vscode.window.showWarningMessage(`${MANIFEST.displayName}: ${message}`);
}

function disposeAll(disposables: vscode.Disposable[]): void {
    for (const disposable of disposables.splice(0)) {
        disposable.dispose();
    }
}
