import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { WebviewManager } from '../webviewManager';
import { WebviewContentProvider } from '../webviewContentProvider';
import { ErrorReporter } from '../errorReporter';
import { ParameterCache } from '../parameterCache';

suite('Reference Model Test Suite', () => {
	let extensionPath: string;

	suiteSetup(async () => {
		const ext = vscode.extensions.getExtension('owlprecision.hootcad');
		assert.ok(ext, 'Extension should be available');
		if (!ext.isActive) {
			await ext.activate();
		}
		extensionPath = ext.extensionPath;
	});

	test('Load Reference Model command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(
			commands.includes('hootcad.loadReferenceModel'),
			'Load Reference Model command should be registered'
		);
	});

	test('Clear Reference Model command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(
			commands.includes('hootcad.clearReferenceModel'),
			'Clear Reference Model command should be registered'
		);
	});

	test('Manifest should contribute the reference model commands and activation events', () => {
		const ext = vscode.extensions.getExtension('owlprecision.hootcad');
		assert.ok(ext, 'Extension should be available');

		const contributed = (ext.packageJSON.contributes.commands as Array<{ command: string }>).map(c => c.command);
		assert.ok(contributed.includes('hootcad.loadReferenceModel'), 'Manifest should contribute hootcad.loadReferenceModel');
		assert.ok(contributed.includes('hootcad.clearReferenceModel'), 'Manifest should contribute hootcad.clearReferenceModel');

		const activationEvents = ext.packageJSON.activationEvents as string[];
		assert.ok(
			activationEvents.includes('onCommand:hootcad.loadReferenceModel'),
			'Manifest should activate on hootcad.loadReferenceModel'
		);
		assert.ok(
			activationEvents.includes('onCommand:hootcad.clearReferenceModel'),
			'Manifest should activate on hootcad.clearReferenceModel'
		);
	});

	test('Clear Reference Model command should run safely when no preview is open', async () => {
		// The command only talks to the preview panel; with nothing to clear
		// it must complete without throwing.
		await vscode.commands.executeCommand('hootcad.clearReferenceModel');
	});

	test('WebviewManager should accept and clear a reference model with no panel open', () => {
		const manager = createWebviewManager();
		assert.strictEqual(manager.isPanelOpen(), false, 'No panel should be open');
		// Both calls are no-ops without a panel and must not throw: the load
		// command guarantees a panel before sending, and clear is always safe.
		manager.sendReferenceModel('part.glb', new Uint8Array([0x67, 0x6c, 0x54, 0x46]));
		manager.clearReferenceModel();
	});

	test('Bundled renderer should wire the reference model messages', () => {
		const rendererPath = path.join(extensionPath, 'dist', 'webview', 'renderer.js');
		const rendererCode = fs.readFileSync(rendererPath, 'utf8');

		assert.ok(rendererCode.includes('function loadReferenceModel'), 'Renderer should define loadReferenceModel');
		assert.ok(rendererCode.includes('function clearReferenceModel'), 'Renderer should define clearReferenceModel');
		assert.ok(rendererCode.includes('function placeReferenceModel'), 'Renderer should define placeReferenceModel');
		assert.ok(rendererCode.includes("'loadReferenceModel'"), 'Renderer should handle the loadReferenceModel message');
		assert.ok(rendererCode.includes("'clearReferenceModel'"), 'Renderer should handle the clearReferenceModel message');
		assert.ok(rendererCode.includes('referenceModelLoaded'), 'Renderer should report referenceModelLoaded to the host');
		assert.ok(rendererCode.includes('referenceModelError'), 'Renderer should report referenceModelError to the host');
		assert.ok(rendererCode.includes('loadModel'), 'Renderer should call Photonic loadModel');
		assert.ok(rendererCode.includes('getModelInfo'), 'Renderer should read the loaded model info');
	});

	test('Preview HTML should include the Clear Reference button', () => {
		const ext = vscode.extensions.getExtension('owlprecision.hootcad');
		assert.ok(ext, 'Extension should be available');
		const mockContext = {
			extensionUri: ext.extensionUri,
			extensionPath: ext.extensionPath,
		} as vscode.ExtensionContext;
		const provider = new WebviewContentProvider(mockContext);

		const html = provider.getWebviewContent(createMockWebview());
		assert.ok(html.includes('id="snapshot-button"'), 'Should keep the Snapshot button');
		assert.ok(html.includes('id="clear-reference-button"'), 'Should have the Clear Reference button');
	});
});

/**
 * Build a WebviewManager against minimal mocks (no panel is ever created)
 */
function createWebviewManager(): WebviewManager {
	const outputChannel = {
		appendLine: () => {}
	} as unknown as vscode.OutputChannel;
	const errorReporter = new ErrorReporter(outputChannel);

	const mockContext = {
		extensionUri: vscode.Uri.file('/tmp'),
		subscriptions: [],
		workspaceState: {
			get: () => undefined,
			update: () => Promise.resolve()
		}
	} as unknown as vscode.ExtensionContext;
	const parameterCache = new ParameterCache(mockContext);

	const statusBarItem = {
		text: '',
		show: () => {},
		dispose: () => {}
	} as unknown as vscode.StatusBarItem;

	return new WebviewManager(mockContext, errorReporter, parameterCache, statusBarItem);
}

/**
 * Create a mock webview for testing
 */
function createMockWebview(): vscode.Webview {
	return {
		asWebviewUri: (uri: vscode.Uri) => {
			return vscode.Uri.parse(`vscode-webview://mock/${uri.path}`);
		},
		html: '',
		options: {},
		onDidReceiveMessage: () => ({ dispose: () => {} }),
		postMessage: () => Promise.resolve(true),
		cspSource: 'vscode-webview://mock'
	} as any;
}
