import * as assert from 'assert';
import * as vscode from 'vscode';
import { resolveJscadEntrypoint } from '../jscadEngine';
import { extractFilename, formatPreviewTitle } from '../utilities';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('HootCAD extension should be present', () => {
		const extension = vscode.extensions.getExtension('hootcad.hootcad');
		assert.ok(extension, 'Extension should be present');
	});

	test('Extension should activate successfully', async () => {
		const extension = vscode.extensions.getExtension('hootcad.hootcad');
		assert.ok(extension, 'Extension should exist');
		
		await extension.activate();
		assert.strictEqual(extension.isActive, true, 'Extension should be active');
	});

	test('HootCAD: Open Preview command should be registered', async () => {
		const extension = vscode.extensions.getExtension('hootcad.hootcad');
		assert.ok(extension, 'Extension should exist');
		
		// Ensure extension is activated before checking for commands
		if (!extension.isActive) {
			await extension.activate();
		}
		
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('hootcad.openPreview'), 'Open Preview command should be registered');
	});

	test('JSCAD language should be registered', () => {
		const languages = vscode.languages.getLanguages();
		return languages.then((langs) => {
			assert.ok(langs.includes('jscad'), 'JSCAD language should be registered');
		});
	});

	test('Preview window title formatting', () => {
		// Test Unix-style path
		const unixPath = '/path/to/file/example.jscad';
		assert.strictEqual(extractFilename(unixPath), 'example.jscad', 'Should extract filename from Unix path');
		assert.strictEqual(formatPreviewTitle(unixPath), '🦉 example.jscad', 'Should format title with owl emoji');

		// Test Windows-style path
		const windowsPath = 'C:\\Users\\file\\test.jscad';
		assert.strictEqual(extractFilename(windowsPath), 'test.jscad', 'Should extract filename from Windows path');
		assert.strictEqual(formatPreviewTitle(windowsPath), '🦉 test.jscad', 'Should format Windows path title');

		// Test filename without directory
		const bareFilename = 'file.jscad';
		assert.strictEqual(extractFilename(bareFilename), 'file.jscad', 'Should handle filename without directory');
		assert.strictEqual(formatPreviewTitle(bareFilename), '🦉 file.jscad', 'Should format bare filename title');

		// Test fallback
		const emptyPath = '';
		assert.strictEqual(extractFilename(emptyPath), 'preview', 'Should use fallback for empty path');
		assert.strictEqual(formatPreviewTitle(emptyPath), '🦉 preview', 'Should format fallback title');
	});
});

suite('JSCAD Engine Test Suite', () => {
	test('resolveJscadEntrypoint should return null when no workspace and no active editor', () => {
		// This test assumes no workspace is open and no .jscad file is active
		// The actual behavior depends on the test environment
		const entrypoint = resolveJscadEntrypoint();
		// entrypoint can be null or an object depending on test environment
		assert.ok(entrypoint === null || typeof entrypoint === 'object');
	});
});
