import * as vscode from 'vscode';
import pkg from '../package.json';
import { handleCommitTranslations } from './handlers/commitTranslations';
import { Logger } from './utils/logger';
import { XliffSyncProvider } from './utils/xliffSyncProvider';

export const MANIFEST = pkg;
export const COMMAND_COMMIT_TRANSLATIONS = pkg.contributes.commands[0].command;

export function activate(context: vscode.ExtensionContext) {
    Logger.initialize(context);

    const xliffSyncProvider = new XliffSyncProvider();
    context.subscriptions.push(
        xliffSyncProvider,
        vscode.commands.registerCommand(COMMAND_COMMIT_TRANSLATIONS, () => handleCommitTranslations(xliffSyncProvider))
    );

    Logger.info(`Successfully activated "${MANIFEST.displayName}" extension.`);
}

export function deactivate() { }
