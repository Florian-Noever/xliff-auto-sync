import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/**/*.test.js',
	// extensionDependencies also lists the built-in vscode.git, which cannot be installed
	skipExtensionDependencies: true,
	installExtensions: ['rvanbekkum.xliff-sync'],
	mocha: {
		timeout: 60_000,
	},
});
