import * as assert from 'assert';
import pkg from '../../../package.json';
import { CONFIG_SECTION, getConfiguration } from '../../utils/configuration';

suite('Configuration', () => {
    // Runs before the integration suite changes any settings (test files load alphabetically)
    test('reads every contributed setting with its package.json default', () => {
        const expected = Object.fromEntries(
            Object.entries(pkg.contributes.configuration.properties).map(([key, schema]) => [key.slice(CONFIG_SECTION.length + 1), schema.default])
        );

        assert.deepStrictEqual(getConfiguration(), expected);
    });
});
