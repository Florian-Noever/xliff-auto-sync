import * as vscode from 'vscode';
import type { API, GitExtension, Repository } from '../types/git';
import { Logger } from './logger';

const GIT_EXTENSION_ID = 'vscode.git';

export function getGitApi(): API | undefined {
    const gitExtension = vscode.extensions.getExtension<GitExtension>(GIT_EXTENSION_ID)?.exports;
    if (!gitExtension?.enabled) {
        return;
    }

    try {
        return gitExtension.getAPI(1);
    } catch (e) {
        Logger.warn(`Failed to get the Git API: ${e instanceof Error ? e.message : String(e)}`);
        return;
    }
}

// The Git API hands out a new wrapper object on every access, so repositories are identified by their root
export function getRepositoryKey(repository: Repository): string {
    return repository.rootUri.toString();
}

export function getActiveRepository(gitApi: API): Repository | undefined {
    const repositories = gitApi.repositories;
    if (repositories.length <= 1) {
        return repositories[0];
    }

    const activeUri = vscode.window.activeTextEditor?.document.uri;
    const activeRepository = activeUri ? gitApi.getRepository(activeUri) : null;
    return activeRepository ?? repositories.find((repository) => repository.ui.selected);
}
