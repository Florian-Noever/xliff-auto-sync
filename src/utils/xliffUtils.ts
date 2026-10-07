import type { Change } from '../types/git';

export type ChangePaths = Pick<Change, 'uri' | 'originalUri' | 'renameUri'>;

const XLIFF_PATH_PATTERN = /\.(xlf|xliff)$/i;

export function isXliffPath(fsPath: string): boolean {
    return XLIFF_PATH_PATTERN.test(fsPath);
}

export function collectXliffPaths(changes: readonly ChangePaths[]): string[] {
    return getChangedPaths(changes).filter(isXliffPath);
}

export function getNonXliffPaths(changes: readonly ChangePaths[]): string[] {
    return getChangedPaths(changes).filter((fsPath) => !isXliffPath(fsPath));
}

// Original and renamed paths are included, so renames and deletions get staged completely
function getChangedPaths(changes: readonly ChangePaths[]): string[] {
    const uris = changes.flatMap((change) => [change.uri, change.originalUri, change.renameUri]);
    return [...new Set(uris.flatMap((uri) => uri ? [uri.fsPath] : []))];
}
