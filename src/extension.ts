import * as vscode from 'vscode';
import { resolveJscadEntrypoint, executeJscadFile } from './jscadEngine';

let outputChannel: vscode.OutputChannel;
let currentPanel: vscode.WebviewPanel | undefined;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
	// Create output channel
	outputChannel = vscode.window.createOutputChannel("HootCAD");
	context.subscriptions.push(outputChannel);
	
	outputChannel.appendLine('HootCAD extension activated');

	// Create status bar item
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.text = "HootCAD: Ready";
	context.subscriptions.push(statusBarItem);
	statusBarItem.show();

	// Register the "Open Preview" command
	const openPreviewCommand = vscode.commands.registerCommand('hootcad.openPreview', async () => {
		outputChannel.appendLine('Opening HootCAD preview...');
		await createOrShowPreview(context);
	});
	context.subscriptions.push(openPreviewCommand);

	// Watch for file saves
	const saveWatcher = vscode.workspace.onDidSaveTextDocument(async (document) => {
		if (document.fileName.endsWith('.jscad')) {
			const fileName = document.fileName.split('/').pop() || document.fileName;
			outputChannel.appendLine(`File saved: ${fileName}`);
			statusBarItem.text = `HootCAD: Saved ${fileName}`;
			
			// Re-execute and re-render if panel is open
			if (currentPanel) {
				const entrypoint = resolveJscadEntrypoint();
				if (entrypoint) {
					await executeAndRender(entrypoint.filePath);
				}
			}
			
			// Reset status after 3 seconds
			setTimeout(() => {
				statusBarItem.text = "HootCAD: Ready";
			}, 3000);
		}
	});
	context.subscriptions.push(saveWatcher);

	// Watch for active editor changes
	const editorWatcher = vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (editor && editor.document.fileName.endsWith('.jscad')) {
			const fileName = editor.document.fileName.split('/').pop() || editor.document.fileName;
			outputChannel.appendLine(`Active file: ${fileName}`);
			statusBarItem.text = `HootCAD: ${fileName}`;
		}
	});
	context.subscriptions.push(editorWatcher);
}

async function createOrShowPreview(context: vscode.ExtensionContext) {
	// Resolve JSCAD entrypoint
	const entrypoint = resolveJscadEntrypoint();
	
	if (!entrypoint) {
		const errorMsg = 'No JSCAD entrypoint found. Open a .jscad file or define one in package.json.';
		outputChannel.appendLine(`Error: ${errorMsg}`);
		vscode.window.showErrorMessage(errorMsg);
		return;
	}

	outputChannel.appendLine(`Resolved entrypoint: ${entrypoint.filePath} (source: ${entrypoint.source})`);

	// If panel already exists, reveal it
	if (currentPanel) {
		currentPanel.reveal(vscode.ViewColumn.Two);
		// Re-execute and render
		await executeAndRender(entrypoint.filePath);
		return;
	}

	// Create new webview panel
	currentPanel = vscode.window.createWebviewPanel(
		'hootcadPreview',
		'HootCAD Preview',
		vscode.ViewColumn.Two,
		{
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: [
				vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@jscad', 'regl-renderer', 'dist')
			]
		}
	);

	// Set HTML content
	currentPanel.webview.html = getWebviewContent(context, currentPanel.webview);

	// Handle messages from webview
	currentPanel.webview.onDidReceiveMessage(
		async message => {
			switch (message.type) {
				case 'info':
					outputChannel.appendLine(`Webview message: ${message.text}`);
					vscode.window.showInformationMessage(message.text);
					return;
				case 'ready':
					outputChannel.appendLine('Webview is ready');
					// Execute and render the JSCAD file
					await executeAndRender(entrypoint.filePath);
					return;
			}
		},
		undefined,
		context.subscriptions
	);

	// Reset panel when disposed
	currentPanel.onDidDispose(
		() => {
			currentPanel = undefined;
			outputChannel.appendLine('Preview panel closed');
		},
		null,
		context.subscriptions
	);

	outputChannel.appendLine('Preview panel created');
}

async function executeAndRender(filePath: string) {
	try {
		outputChannel.appendLine(`Executing JSCAD file: ${filePath}`);
		statusBarItem.text = "HootCAD: Executing...";

		const entities = await executeJscadFile(filePath, outputChannel);

		if (currentPanel) {
			currentPanel.webview.postMessage({
				type: 'renderEntities',
				entities: entities
			});
			outputChannel.appendLine('Render entities sent to webview');
			statusBarItem.text = "HootCAD: Rendered";
			
			// Reset status after 3 seconds
			setTimeout(() => {
				statusBarItem.text = "HootCAD: Ready";
			}, 3000);
		}
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		outputChannel.appendLine(`Execution failed: ${errorMsg}`);
		vscode.window.showErrorMessage(`JSCAD execution failed: ${errorMsg}`);
		statusBarItem.text = "HootCAD: Error";
		
		if (currentPanel) {
			currentPanel.webview.postMessage({
				type: 'error',
				message: errorMsg
			});
		}
	}
}

function getWebviewContent(context: vscode.ExtensionContext, webview: vscode.Webview): string {
	// Get the renderer library path
	const rendererPath = vscode.Uri.joinPath(
		context.extensionUri,
		'node_modules',
		'@jscad',
		'regl-renderer',
		'dist',
		'jscad-regl-renderer.min.js'
	);
	
	// Convert to webview URI
	const rendererUri = webview.asWebviewUri(rendererPath);

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>HootCAD Preview</title>
	<style>
		body {
			margin: 0;
			padding: 0;
			font-family: var(--vscode-font-family);
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
			overflow: hidden;
		}
		#container {
			display: flex;
			flex-direction: column;
			height: 100vh;
		}
		#header {
			padding: 10px 20px;
			border-bottom: 1px solid var(--vscode-panel-border);
		}
		h1 {
			margin: 0;
			font-size: 16px;
			color: var(--vscode-editor-foreground);
		}
		#canvas-container {
			flex: 1;
			position: relative;
			background-color: #1e1e1e;
		}
		#renderCanvas {
			width: 100%;
			height: 100%;
			display: block;
		}
		#status {
			padding: 8px 20px;
			background-color: var(--vscode-editor-inactiveSelectionBackground);
			border-top: 1px solid var(--vscode-panel-border);
			font-size: 12px;
		}
		#error-message {
			position: absolute;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			background-color: var(--vscode-inputValidation-errorBackground);
			border: 1px solid var(--vscode-inputValidation-errorBorder);
			color: var(--vscode-errorForeground);
			padding: 20px;
			border-radius: 4px;
			display: none;
			max-width: 80%;
			text-align: center;
		}
		.loading {
			position: absolute;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			color: var(--vscode-foreground);
		}
	</style>
	<script src="${rendererUri}"></script>
</head>
<body>
	<div id="container">
		<div id="header">
			<h1>HootCAD Preview</h1>
		</div>
		<div id="canvas-container">
			<canvas id="renderCanvas"></canvas>
			<div id="loading" class="loading">Loading...</div>
			<div id="error-message"></div>
		</div>
		<div id="status">Status: Initializing...</div>
	</div>

	<script>
		const vscode = acquireVsCodeApi();
		const canvas = document.getElementById('renderCanvas');
		const statusElement = document.getElementById('status');
		const loadingElement = document.getElementById('loading');
		const errorElement = document.getElementById('error-message');
		
		let renderer = null;
		let currentEntities = [];

		// Initialize the JSCAD renderer
		function initRenderer() {
			try {
				const container = canvas.parentElement;
				canvas.width = container.clientWidth;
				canvas.height = container.clientHeight;

				// Initialize the official JSCAD regl-renderer
				const rendererOptions = {
					glOptions: { 
						canvas: canvas,
						preserveDrawingBuffer: true
					}
				};
				
				renderer = jscadReglRenderer(rendererOptions);
				
				// Set up camera with reasonable defaults
				const perspectiveCamera = renderer.camera.setProjection({
					fov: 45,
					near: 0.1,
					far: 1000
				});
				renderer.camera.setPosition([0, 0, 100]);
				renderer.camera.setTarget([0, 0, 0]);
				
				statusElement.textContent = 'Status: Renderer initialized';
				return true;
			} catch (error) {
				showError('Failed to initialize renderer: ' + error.message);
				return false;
			}
		}

		function renderEntities(entities) {
			if (!renderer) {
				showError('Renderer not initialized');
				return;
			}

			try {
				// Store entities for re-rendering on resize
				currentEntities = entities;

				// Render the scene with the pre-converted entities
				renderer.render({ entities: currentEntities });
				
				loadingElement.style.display = 'none';
				statusElement.textContent = \`Status: Rendered \${entities.length} entit\${entities.length === 1 ? 'y' : 'ies'}\`;
			} catch (error) {
				showError('Rendering failed: ' + error.message);
			}
		}

		function showError(message) {
			errorElement.textContent = message;
			errorElement.style.display = 'block';
			loadingElement.style.display = 'none';
			statusElement.textContent = 'Status: Error - ' + message;
		}

		// Handle window resize
		window.addEventListener('resize', () => {
			if (renderer) {
				const container = canvas.parentElement;
				canvas.width = container.clientWidth;
				canvas.height = container.clientHeight;
				
				// Re-render on resize
				if (currentEntities.length > 0) {
					renderer.render({ entities: currentEntities });
				}
			}
		});

		// Listen for messages from extension
		window.addEventListener('message', event => {
			const message = event.data;
			switch (message.type) {
				case 'renderEntities':
					if (message.entities && message.entities.length > 0) {
						renderEntities(message.entities);
					} else {
						showError('No entity data received');
					}
					break;
				case 'error':
					showError(message.message);
					break;
			}
		});

		// Initialize renderer and notify extension we're ready
		if (typeof jscadReglRenderer !== 'undefined') {
			if (initRenderer()) {
				loadingElement.style.display = 'none';
				statusElement.textContent = 'Status: Ready';
				vscode.postMessage({ type: 'ready' });
			}
		} else {
			showError('JSCAD renderer library not loaded');
		}
	</script>
</body>
</html>`;
}

export function deactivate() {
	if (outputChannel) {
		outputChannel.appendLine('HootCAD extension deactivated');
		outputChannel.dispose();
	}
}
