import * as assert from 'assert';
import * as vscode from 'vscode';
import { WebviewContentProvider } from '../webviewContentProvider';
import { parse } from 'acorn';

suite('Webview Content Validation', () => {
	let provider: WebviewContentProvider;

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
		const mockWebview = createMockWebview();
		const html = provider.getWebviewContent(mockWebview);
		
		// Extract script content
		const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
		assert.ok(scriptMatch, 'Should have script tag');
		
		const scriptContent = scriptMatch![1];

		// Authoritative correctness check: parse the extracted script as an ES module.
		// This reliably catches syntax errors like "missing ) after argument list".
		parse(scriptContent, {
			ecmaVersion: 'latest',
			sourceType: 'module'
		});
		
		// Check for required function definitions
		assert.ok(scriptContent.includes('function initThreeJS'), 'Should define initThreeJS function');
		assert.ok(scriptContent.includes('function renderGeometries'), 'Should define renderGeometries function');
		assert.ok(scriptContent.includes('function showError'), 'Should define showError function');
		assert.ok(scriptContent.includes('function hideError'), 'Should define hideError function');
		assert.ok(scriptContent.includes('function fitCameraToObjects'), 'Should define fitCameraToObjects function');
	});

	test('Generated HTML should not contain syntax errors in string concatenation', () => {
		const mockWebview = createMockWebview();
		const html = provider.getWebviewContent(mockWebview);
		
		// Extract script content
		const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
		const scriptContent = scriptMatch![1];
		
		// Check that status messages are properly formatted
		assert.ok(
			scriptContent.includes("'Status: Rendered '") || 
			scriptContent.includes('"Status: Rendered "') ||
			scriptContent.includes('`Status: Rendered ${'),
			'Status message should be properly formatted'
		);
		
		// Note: We intentionally don't do naive quote-counting here.
		// The JS parser validation test above is the authoritative correctness check.
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
		
		// Extract script content
		const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
		const scriptContent = scriptMatch![1];
		
		// Check for imports
		assert.ok(scriptContent.includes("import * as THREE from"), 'Should import THREE.js');
		assert.ok(scriptContent.includes("import { convertGeom3ToBufferGeometry"), 'Should import converter functions');
		assert.ok(scriptContent.includes("import { updateParameterUI }"), 'Should import parameter UI');
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
