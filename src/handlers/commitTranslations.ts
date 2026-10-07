import * as vscode from 'vscode';
import { MANIFEST } from '../extension';
import { getActiveRepository, getGitApi } from '../utils/gitUtils';
import type { XliffSyncProvider } from '../utils/xliffSyncProvider';

export async function handleCommitTranslations(xliffSyncProvider: XliffSyncProvider): Promise<void> {
    const gitApi = getGitApi();
    const repository = gitApi ? getActiveRepository(gitApi) : undefined;
    if (!repository) {
        vscode.window.showErrorMessage(`${MANIFEST.displayName}: No Git repository found.`);
        return;
    }

    await xliffSyncProvider.syncAndCommit(repository, { manual: true });
}
