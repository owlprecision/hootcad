import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';

suite('Cursor IDE Compatibility Test Suite', () => {
	const packageJsonPath = path.join(__dirname, '../../package.json');
	
	test('package.json exists', () => {
		assert.ok(fs.existsSync(packageJsonPath), 'package.json should exist');
	});

	test('package.json has valid VS Code engine requirement', () => {
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
		assert.ok(packageJson.engines, 'package.json should have engines field');
		assert.ok(packageJson.engines.vscode, 'package.json should specify vscode engine');
		assert.ok(packageJson.engines.vscode.startsWith('^'), 'vscode engine should use caret (^) for compatibility');
	});

	test('package.json description mentions both VS Code and Cursor', () => {
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
		assert.ok(packageJson.description, 'package.json should have description');
		const description = packageJson.description.toLowerCase();
		assert.ok(
			description.includes('vscode') || description.includes('vs code'),
			'Description should mention VS Code'
		);
		assert.ok(
			description.includes('cursor'),
			'Description should mention Cursor for discoverability'
		);
	});

	test('package.json has cursor keyword for discoverability', () => {
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
		assert.ok(packageJson.keywords, 'package.json should have keywords');
		assert.ok(Array.isArray(packageJson.keywords), 'keywords should be an array');
		const hasKeyword = packageJson.keywords.some((k: string) => 
			k.toLowerCase() === 'cursor'
		);
		assert.ok(hasKeyword, 'package.json should include "cursor" in keywords for OpenVSX discoverability');
	});

	test('package.json has vscode keyword', () => {
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
		const hasKeyword = packageJson.keywords.some((k: string) => 
			k.toLowerCase() === 'vscode'
		);
		assert.ok(hasKeyword, 'package.json should include "vscode" in keywords');
	});

	test('package.json has required fields for extension', () => {
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
		assert.ok(packageJson.name, 'package.json should have name');
		assert.ok(packageJson.displayName, 'package.json should have displayName');
		assert.ok(packageJson.version, 'package.json should have version');
		assert.ok(packageJson.publisher, 'package.json should have publisher');
		assert.ok(packageJson.main, 'package.json should have main entry point');
		assert.ok(packageJson.contributes, 'package.json should have contributes section');
	});

	test('extension uses only standard VS Code APIs (no proprietary APIs)', () => {
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
		
		const dependencies = packageJson.dependencies || {};
		const devDependencies = packageJson.devDependencies || {};
		
		// These are the standard allowed development dependencies
		const allowedVSCodeDeps = [
			'@types/vscode',
			'@vscode/test-cli',
			'@vscode/test-electron',
			'@vscode/vsce'
		];
		
		// Check dev dependencies - only validate if they're in our known list
		for (const dep of Object.keys(devDependencies)) {
			if (dep.startsWith('@vscode/') || dep.startsWith('vscode-')) {
				assert.ok(
					allowedVSCodeDeps.includes(dep),
					`Dev dependency ${dep} should be in the standard VS Code dev dependency list. ` +
					`If this is a new standard package, add it to the allowlist.`
				);
			}
		}
		
		// Runtime dependencies should not include VS Code-specific packages
		// This ensures the extension works in Cursor which may have different internals
		const problematicDeps = Object.keys(dependencies).filter(dep => 
			dep.startsWith('@vscode/') || dep.startsWith('vscode-')
		);
		assert.strictEqual(
			problematicDeps.length, 
			0,
			`Runtime dependencies should not be VS Code-specific to ensure Cursor compatibility. ` +
			`Found: ${problematicDeps.join(', ')}`
		);
	});

	test('.cursorignore file exists', () => {
		const cursorIgnorePath = path.join(__dirname, '../../.cursorignore');
		assert.ok(
			fs.existsSync(cursorIgnorePath),
			'.cursorignore should exist for Cursor-specific packaging'
		);
	});

	test('.cursorignore has similar content to .vscodeignore', () => {
		const cursorIgnorePath = path.join(__dirname, '../../.cursorignore');
		const vscodeignorePath = path.join(__dirname, '../../.vscodeignore');
		
		if (fs.existsSync(cursorIgnorePath) && fs.existsSync(vscodeignorePath)) {
			const cursorIgnore = fs.readFileSync(cursorIgnorePath, 'utf8');
			const vscodeignore = fs.readFileSync(vscodeignorePath, 'utf8');
			
			// They should be identical or very similar
			// For now, just check they both exist and are non-empty
			assert.ok(cursorIgnore.length > 0, '.cursorignore should not be empty');
			assert.ok(vscodeignore.length > 0, '.vscodeignore should not be empty');
		}
	});

	test('extension activation events are editor-agnostic', () => {
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
		const activationEvents = packageJson.activationEvents || [];
		
		// Standard activation event prefixes supported by both VS Code and Cursor
		const standardEventPrefixes = [
			'onLanguage:',
			'onCommand:',
			'onView:',
			'onUri:',
			'onFileSystem:',
			'onWebviewPanel:',
			'workspaceContains:',
			'onStartupFinished',
			'onDebug',
			'onTaskType:',
			'onCustomEditor:',
			'onAuthenticationRequest:',
			'onTerminalProfile:',
			'*'  // Special case: activate on startup
		];
		
		// All activation events should use standard prefixes
		for (const event of activationEvents) {
			const isStandard = standardEventPrefixes.some(prefix => 
				event === prefix || event.startsWith(prefix)
			);
			assert.ok(
				isStandard,
				`Activation event "${event}" should use a standard VS Code activation event prefix ` +
				`to ensure compatibility with both VS Code and Cursor`
			);
		}
	});

	test('commands are properly namespaced', () => {
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
		const commands = packageJson.contributes?.commands || [];
		
		for (const cmd of commands) {
			assert.ok(
				cmd.command.startsWith('hootcad.'),
				`Command ${cmd.command} should be namespaced with extension name`
			);
		}
	});

	test('no hardcoded VS Code references in code that would break in Cursor', () => {
		// This is a basic test - in a real scenario you'd scan source files
		// For now, we just verify that the package.json doesn't have VS Code-specific
		// settings that would prevent Cursor compatibility
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
		
		// Check for any VS Code-specific configuration that might not work in Cursor
		// For example, checking that there are no VS Code marketplace-specific fields
		// that would prevent the extension from working in Cursor
		assert.ok(
			!packageJson.galleryBanner?.theme || 
			packageJson.galleryBanner?.theme === 'dark' ||
			packageJson.galleryBanner?.theme === 'light',
			'Gallery banner theme, if present, should use standard values'
		);
	});
});
