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

export function splitDeletedPaths(paths: readonly string[], exists: (fsPath: string) => boolean): { present: string[]; deleted: string[] } {
    const present: string[] = [];
    const deleted: string[] = [];
    for (const fsPath of paths) {
        (exists(fsPath) ? present : deleted).push(fsPath);
    }
    return { present, deleted };
}

// Both sides of a rename are included, so the new file gets staged and the old one is recognized as deleted
function getChangedPaths(changes: readonly ChangePaths[]): string[] {
    const uris = changes.flatMap((change) => [change.uri, change.originalUri, change.renameUri]);
    return [...new Set(uris.flatMap((uri) => uri ? [uri.fsPath] : []))];
}
