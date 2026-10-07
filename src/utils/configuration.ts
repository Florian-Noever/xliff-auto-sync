import * as vscode from 'vscode';

export const CONFIG_SECTION = 'xliffAutoSync';

export type AutomationMode = 'always' | 'never';

export interface XliffAutoSyncConfiguration {
    syncCommand: string | undefined;
    commitAfterSync: AutomationMode | undefined;
    pushAfterCommit: AutomationMode | undefined;
}

// No inline fallbacks: the defaults contributed in package.json are the single source of truth,
// so a mistyped key surfaces as `undefined` instead of silently falling back to a default.
export function getConfiguration(scope?: vscode.Uri): XliffAutoSyncConfiguration {
    const configuration = vscode.workspace.getConfiguration(CONFIG_SECTION, scope);
    return {
        syncCommand: configuration.get<string>('syncCommand'),
        commitAfterSync: configuration.get<AutomationMode>('commitAfterSync'),
        pushAfterCommit: configuration.get<AutomationMode>('pushAfterCommit'),
    };
}
