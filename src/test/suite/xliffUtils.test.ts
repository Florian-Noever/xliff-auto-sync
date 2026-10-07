import * as assert from 'assert';
import * as vscode from 'vscode';
import { type ChangePaths, collectXliffPaths, getNonXliffPaths, isXliffPath } from '../../utils/xliffUtils';

function change(filePath: string, renamedTo?: string): ChangePaths {
    const originalUri = vscode.Uri.file(filePath);
    const renameUri = renamedTo ? vscode.Uri.file(renamedTo) : undefined;
    return { uri: renameUri ?? originalUri, originalUri, renameUri };
}

function fsPaths(...filePaths: string[]): string[] {
    return filePaths.map((filePath) => vscode.Uri.file(filePath).fsPath);
}

suite('XLIFF utilities', () => {
    test('isXliffPath matches .xlf and .xliff case-insensitively', () => {
        for (const filePath of ['App.xlf', 'App.XLF', 'Translations/App.g.xlf', 'App.xliff', 'App.XLiff']) {
            assert.ok(isXliffPath(filePath), filePath);
        }
        for (const filePath of ['App.xml', 'App.xlf.bak', 'xlf', 'App.txt', 'App.xlff']) {
            assert.ok(!isXliffPath(filePath), filePath);
        }
    });

    test('collectXliffPaths keeps only XLIFF files', () => {
        const changes = [change('/repo/Translations/App.de-DE.xlf'), change('/repo/src/App.al'), change('/repo/Translations/App.fr-FR.xliff')];

        assert.deepStrictEqual(collectXliffPaths(changes), fsPaths('/repo/Translations/App.de-DE.xlf', '/repo/Translations/App.fr-FR.xliff'));
    });

    test('collectXliffPaths includes both sides of a rename', () => {
        assert.deepStrictEqual(collectXliffPaths([change('/repo/Old.xlf', '/repo/New.xlf')]), fsPaths('/repo/New.xlf', '/repo/Old.xlf'));
    });

    test('collectXliffPaths removes duplicates', () => {
        const changes = [change('/repo/App.de-DE.xlf'), change('/repo/App.de-DE.xlf')];

        assert.deepStrictEqual(collectXliffPaths(changes), fsPaths('/repo/App.de-DE.xlf'));
    });

    test('getNonXliffPaths returns only non-XLIFF files', () => {
        assert.deepStrictEqual(getNonXliffPaths([change('/repo/App.de-DE.xlf'), change('/repo/src/App.al')]), fsPaths('/repo/src/App.al'));
        assert.deepStrictEqual(getNonXliffPaths([change('/repo/App.de-DE.xlf')]), []);
    });
});
