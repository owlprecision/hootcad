import * as assert from 'assert';
import * as vscode from 'vscode';
import { WebviewContentProvider } from '../webviewContentProvider';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'acorn';

suite('Webview Content Validation', () => {
	let provider: WebviewContentProvider;
		let extensionPath: string;

	suiteSetup(async () => {
		// Get extension and activate it
		const ext = vscode.extensions.getExtension('hootcad.hootcad');
		assert.ok(ext, 'Extension should be available');
		
		if (!ext.isActive) {
			await ext.activate();
		}
		
		// Create provider with a minimal context mock
		const mockContext = {
			extensionUri: ext.extensionUri,
			extensionPath: ext.extensionPath,
		} as vscode.ExtensionContext;
			extensionPath = ext.extensionPath;
		
		provider = new WebviewContentProvider(mockContext);
	});

	test('Generated HTML should have valid structure', () => {
		// Create a mock webview
		const mockWebview = createMockWebview();
		
		const html = provider.getWebviewContent(mockWebview);
		
		// Basic HTML structure validation
		assert.ok(html.includes('<!DOCTYPE html>'), 'Should have DOCTYPE');
		assert.ok(html.includes('<html'), 'Should have html tag');
		assert.ok(html.includes('</html>'), 'Should have closing html tag');
		assert.ok(html.includes('<head>'), 'Should have head tag');
		assert.ok(html.includes('</head>'), 'Should have closing head tag');
		assert.ok(html.includes('<body>'), 'Should have body tag');
		assert.ok(html.includes('</body>'), 'Should have closing body tag');
	});

	test('Generated HTML should have valid JavaScript syntax', () => {
		// Parse the external renderer entry module from disk (authoritative correctness check)
		const rendererPath = path.join(extensionPath, 'src', 'webview', 'renderer.js');
		const rendererCode = fs.readFileSync(rendererPath, 'utf8');

		parse(rendererCode, {
			ecmaVersion: 'latest',
			sourceType: 'module'
		});

		// Check for required function definitions
		assert.ok(rendererCode.includes('function initThreeJS'), 'Should define initThreeJS function');
		assert.ok(rendererCode.includes('function renderGeometries'), 'Should define renderGeometries function');
		assert.ok(rendererCode.includes('function showError'), 'Should define showError function');
		assert.ok(rendererCode.includes('function hideError'), 'Should define hideError function');
		assert.ok(rendererCode.includes('function fitCameraToObjects'), 'Should define fitCameraToObjects function');
	});

	test('Generated HTML should not contain syntax errors in string concatenation', () => {
		const rendererPath = path.join(extensionPath, 'src', 'webview', 'renderer.js');
		const rendererCode = fs.readFileSync(rendererPath, 'utf8');

		// Check that status messages are properly formatted
		assert.ok(
			rendererCode.includes("'Status: Rendered '") ||
			rendererCode.includes('"Status: Rendered "') ||
			rendererCode.includes('`Status: Rendered ${') ||
			rendererCode.includes('Status: Rendered '),
			'Status message should be properly formatted'
		);
	});

	test('Generated HTML should include required DOM elements', () => {
		const mockWebview = createMockWebview();
		const html = provider.getWebviewContent(mockWebview);
		
		// Check for required elements
		assert.ok(html.includes('id="renderCanvas"'), 'Should have render canvas');
		assert.ok(html.includes('id="status"'), 'Should have status element');
		assert.ok(html.includes('id="loading"'), 'Should have loading element');
		assert.ok(html.includes('id="error-message"'), 'Should have error message element');
		assert.ok(html.includes('id="parameter-panel"'), 'Should have parameter panel');
		assert.ok(html.includes('id="parameter-content"'), 'Should have parameter content');
	});

	test('Generated HTML should properly import Three.js modules', () => {
		const mockWebview = createMockWebview();
		const html = provider.getWebviewContent(mockWebview);

		// Script should be external (no inline renderer)
		assert.ok(
			html.match(/<script[^>]*type="module"[^>]*src="[^"]+"[^>]*><\/script>/),
			'Should have external module script tag'
		);
		assert.ok(
			html.includes('<link rel="stylesheet"'),
			'Should reference external stylesheet'
		);

		// Check that renderer.js is set up to load the modules
		const rendererPath = path.join(extensionPath, 'src', 'webview', 'renderer.js');
		const rendererCode = fs.readFileSync(rendererPath, 'utf8');
		assert.ok(rendererCode.includes('await import(config.threeUri)'), 'Should import THREE.js via config');
		assert.ok(rendererCode.includes('await import(config.converterUri)'), 'Should import converter via config');
		assert.ok(rendererCode.includes('await import(config.parameterUIUri)'), 'Should import parameter UI via config');
	});
});

/**
 * Create a mock webview for testing
 */
function createMockWebview(): vscode.Webview {
	return {
		asWebviewUri: (uri: vscode.Uri) => {
			// Return a mock webview URI
			return vscode.Uri.parse(`vscode-webview://mock/${uri.path}`);
		},
		html: '',
		options: {},
		onDidReceiveMessage: () => ({ dispose: () => {} }),
		postMessage: () => Promise.resolve(true),
		cspSource: 'vscode-webview://mock'
	} as any;
}
