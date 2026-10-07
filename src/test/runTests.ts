import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import pkg from '../../package.json';
import { pathToFileURL } from 'url';
import { runTests, runVSCodeCommand } from '@vscode/test-electron';

async function main() {
    // Inherited by processes spawned from VS Code extensions (e.g. AI agents); it would start the test instance as plain Node.js
    delete process.env.ELECTRON_RUN_AS_NODE;

    // Windows: avoids MAX_PATH limits and the spaces or '&' that break VS Code's cmd.exe-based CLI
    const cachePath = process.platform === 'win32' ? path.join(os.tmpdir(), 'xliff-auto-sync-vscode-test') : path.resolve('.vscode-test');
    const downloadOptions = { version: 'stable', cachePath };
    const launchArgs = ['--extensions-dir', path.join(cachePath, 'extensions'), '--user-data-dir', path.join(cachePath, 'user-data')];

    // Built-in extensions (vscode.git) ship with VS Code and cannot be installed.
    for (const extensionId of pkg.extensionDependencies.filter((id) => !id.startsWith('vscode.'))) {
        await runVSCodeCommand(['--install-extension', extensionId, ...launchArgs], downloadOptions);
    }

    // Convert both paths to file:// URIs
    const extensionDevelopmentPath = pathToFileURL(path.resolve(__dirname, '../../')).href;
    const extensionTestsPath = pathToFileURL(path.resolve(__dirname, './suite/index')).href;

    // The integration tests create their Git fixtures in here. The folder is removed only after VS Code has exited,
    // because the test instance keeps them locked on Windows.
    const fixturesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'xliff-auto-sync-'));
    try {
        await runTests({ ...downloadOptions, extensionDevelopmentPath, extensionTestsPath, launchArgs, extensionTestsEnv: { XLIFF_AUTO_SYNC_FIXTURES: fixturesPath } });
    } finally {
        fs.rmSync(fixturesPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
}

main().catch((err) => {
    console.error('Failed to run tests:', err);
    process.exit(1);
});
