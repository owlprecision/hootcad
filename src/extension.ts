import * as vscode from 'vscode';
import { resolveJscadEntrypoint, executeJscadFile, getParameterDefinitions } from './jscadEngine';
import { ParameterCache } from './parameterCache';

let outputChannel: vscode.OutputChannel;
let currentPanel: vscode.WebviewPanel | undefined;
let statusBarItem: vscode.StatusBarItem;
let parameterCache: ParameterCache;

/**
 * Extracts the filename from a file path, handling both Unix and Windows path separators.
 * @param filePath The full file path
 * @returns The filename, or 'preview' as fallback
 */
export function extractFilename(filePath: string): string {
	return filePath.split(/[/\\]/).pop() || 'preview';
}

/**
 * Formats a preview window title with the owl emoji and filename.
 * @param filePath The full file path
 * @returns The formatted title (e.g., "🦉 filename.jscad")
 */
export function formatPreviewTitle(filePath: string): string {
	const fileName = extractFilename(filePath);
	return `🦉 ${fileName}`;
}

export function activate(context: vscode.ExtensionContext) {
	// Create output channel
	outputChannel = vscode.window.createOutputChannel("HootCAD");
	context.subscriptions.push(outputChannel);
	
	outputChannel.appendLine('HootCAD extension activated');

	// Initialize parameter cache
	parameterCache = new ParameterCache(context);

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
			const fileName = extractFilename(document.fileName);
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
			const fileName = extractFilename(editor.document.fileName);
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

	// Format the preview window title
	const title = formatPreviewTitle(entrypoint.filePath);

	// If panel already exists, reveal it
	if (currentPanel) {
		currentPanel.title = title;
		currentPanel.reveal(vscode.ViewColumn.Two);
		// Re-execute and render
		await executeAndRender(entrypoint.filePath);
		return;
	}

	// Create new webview panel
	currentPanel = vscode.window.createWebviewPanel(
		'hootcadPreview',
		title,
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
				case 'parameterChanged':
					outputChannel.appendLine(`Parameter changed: ${message.name} = ${message.value}`);
					// Update cache
					parameterCache.updateParameter(message.filePath, message.name, message.value);
					// Re-render with new parameters
					await executeAndRender(message.filePath);
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
	let lastParams: Record<string, any> | undefined;
	try {
		outputChannel.appendLine(`Executing JSCAD file: ${filePath}`);
		statusBarItem.text = "HootCAD: Executing...";

		// Get parameter definitions
		const definitions = await getParameterDefinitions(filePath, outputChannel);
		
		// Get merged parameters (defaults + cached values)
		const params = parameterCache.getMergedParameters(filePath, definitions);
		lastParams = params;

		// Execute with parameters
		const entities = await executeJscadFile(filePath, outputChannel, params);

		if (currentPanel) {
			// Send both entities and parameter UI data to webview
			currentPanel.webview.postMessage({
				type: 'renderEntities',
				entities: entities,
				parameters: {
					definitions: definitions,
					values: params,
					filePath: filePath
				}
			});
			outputChannel.appendLine('Render entities sent to webview');
			statusBarItem.text = "HootCAD: Rendered";
			
			// Reset status after 3 seconds
			setTimeout(() => {
				statusBarItem.text = "HootCAD: Ready";
			}, 3000);
		}
	} catch (error) {
		const errorMsg = (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string')
			? (error as any).message
			: String(error);
		outputChannel.appendLine(`Execution failed: ${errorMsg}`);

		// Best-effort parameter snapshot to help users troubleshoot.
		try {
			const snapshotParams = lastParams;
			if (!snapshotParams) {
				throw new Error('No parameter snapshot available');
			}
			const snapshot = JSON.stringify(snapshotParams, Object.keys(snapshotParams).sort(), 2);
			// Avoid flooding the output.
			const maxLen = 10_000;
			outputChannel.appendLine('Parameter snapshot:');
			outputChannel.appendLine(snapshot.length > maxLen ? snapshot.slice(0, maxLen) + '\n… (truncated)' : snapshot);
		} catch (e) {
			outputChannel.appendLine('Parameter snapshot: <unavailable>');
		}

		// Source location reporting from stack trace, when available.
		const stack = (error && typeof error === 'object' && 'stack' in error && typeof (error as any).stack === 'string')
			? (error as any).stack
			: undefined;
		if (stack) {
			const escaped = filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const match = stack.match(new RegExp(`${escaped}:(\\d+):(\\d+)`));
			if (match) {
				outputChannel.appendLine(`Source location: ${filePath}:${match[1]}:${match[2]}`);
			}
		}

		vscode.window.showErrorMessage(`JSCAD execution failed: ${errorMsg} (see Output → HootCAD for details)`);
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
		:root {
			/* Theme-aware translucent overlay colors */
			--hoot-param-panel-bg: color-mix(in srgb, var(--vscode-editorWidget-background) 88%, transparent);
			--hoot-param-panel-hover-bg: color-mix(in srgb, var(--vscode-list-hoverBackground) 70%, transparent);
			--hoot-param-muted-fg: color-mix(in srgb, var(--vscode-foreground) 50%, transparent);
		}
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
			background-color: #2d2d2d;
		}
		#renderCanvas {
			width: 100%;
			height: 100%;
			display: block;
			background-color: #2d2d2d;
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
		#parameter-panel {
			position: absolute;
			top: 20px;
			right: 20px;
			background-color: var(--hoot-param-panel-bg);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 6px;
			min-width: 250px;
			max-width: 400px;
			max-height: calc(100vh - 200px);
			display: none;
			flex-direction: column;
			box-shadow: 0 4px 12px var(--vscode-widget-shadow);
			backdrop-filter: blur(4px);
		}
		#parameter-panel.visible {
			display: flex;
		}
		#parameter-header {
			padding: 12px 16px;
			border-bottom: 1px solid var(--vscode-panel-border);
			display: flex;
			justify-content: space-between;
			align-items: center;
			cursor: pointer;
			user-select: none;
		}
		#parameter-header:hover {
			background-color: var(--hoot-param-panel-hover-bg);
		}
		#parameter-title {
			font-size: 14px;
			font-weight: 600;
			color: var(--vscode-foreground);
		}
		#collapse-button {
			background: none;
			border: none;
			color: var(--vscode-foreground);
			cursor: pointer;
			font-size: 16px;
			padding: 0;
			width: 20px;
			text-align: center;
		}
		#parameter-content {
			overflow-y: auto;
			padding: 16px;
		}
		#parameter-content.collapsed {
			display: none;
		}
		.parameter-item {
			margin-bottom: 16px;
		}
		.parameter-label {
			display: block;
			margin-bottom: 6px;
			font-size: 12px;
			color: var(--hoot-param-muted-fg);
			font-weight: 500;
		}
		.parameter-input {
			width: 100%;
			padding: 6px 8px;
			background-color: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			color: var(--vscode-input-foreground);
			border-radius: 3px;
			font-size: 13px;
			font-family: var(--vscode-font-family);
		}
		.parameter-input:focus {
			outline: none;
			border-color: var(--vscode-focusBorder);
		}
		.parameter-checkbox {
			width: auto;
			margin-right: 8px;
		}
		.parameter-checkbox-label {
			display: flex;
			align-items: center;
			cursor: pointer;
		}
		.parameter-slider {
			width: 100%;
		}
		.parameter-value {
			font-size: 11px;
			color: var(--hoot-param-muted-fg);
			margin-top: 4px;
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
			<div id="parameter-panel">
				<div id="parameter-header">
					<div id="parameter-title">Parameters</div>
					<button id="collapse-button" title="Collapse/Expand">▼</button>
				</div>
				<div id="parameter-content"></div>
			</div>
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

		function clearError() {
			if (!errorElement) {
				return;
			}
			errorElement.textContent = '';
			errorElement.style.display = 'none';
		}

		function resizeCanvasToDisplaySize() {
			const container = canvas.parentElement;
			const dpr = window.devicePixelRatio || 1;
			const displayWidth = Math.max(1, Math.floor(container.clientWidth * dpr));
			const displayHeight = Math.max(1, Math.floor(container.clientHeight * dpr));
			const needsResize = canvas.width !== displayWidth || canvas.height !== displayHeight;
			if (needsResize) {
				canvas.width = displayWidth;
				canvas.height = displayHeight;
				// Keep CSS size in layout pixels.
				canvas.style.width = container.clientWidth + 'px';
				canvas.style.height = container.clientHeight + 'px';
			}
			return { width: canvas.width, height: canvas.height, dpr, needsResize };
		}

		// Initialize the JSCAD renderer
		function initRenderer() {
			try {
				const size = resizeCanvasToDisplaySize();

				// Initialize the official JSCAD regl-renderer
				const { prepareRender, cameras, controls } = jscadReglRenderer;
				
				// Set up camera with defaults and ensure all properties are set
				const perspectiveCamera = cameras.perspective;
				let camera = Object.assign({}, perspectiveCamera.defaults);
				
				// Update camera projection for canvas size
				camera = perspectiveCamera.setProjection(camera, camera, {
					width: size.width,
					height: size.height
				});
				
				// Update camera view matrix
				camera = perspectiveCamera.update(camera, camera);
				
				console.log('Initialized camera:', camera);
				
				// Set up orbit controls with defaults and disable auto features
				const orbitControls = controls.orbit;
				let controlState = Object.assign({}, orbitControls.defaults);
				
				// Disable auto zoom-to-fit so manual controls work
				if (controlState.zoomToFit) {
					controlState.zoomToFit.auto = false;
				}
				// Disable auto rotate
				if (controlState.autoRotate) {
					controlState.autoRotate.enabled = false;
				}
				
				console.log('Initialized controls:', controlState);
				
				// Prepare renderer with canvas
				const renderOptions = {
					glOptions: { canvas }
				};
				
				const renderFunc = prepareRender(renderOptions);
				
				// Store everything we need for rendering
				renderer = {
					render: renderFunc,
					camera: camera,
					controls: controlState,
					orbitControls: orbitControls,
					perspectiveCamera: perspectiveCamera,
					drawCommands: jscadReglRenderer.drawCommands
				};
				
				console.log('Renderer initialized:', renderer);
				
				// Set up mouse controls
				setupMouseControls();
				
				clearError();
				statusElement.textContent = 'Status: Renderer initialized';
				return true;
			} catch (error) {
				console.error('Init error:', error);
				showError('Failed to initialize renderer: ' + error.message);
				return false;
			}
		}
		
		function setupMouseControls() {
			let isDragging = false;
			let lastX = 0;
			let lastY = 0;
			
			canvas.addEventListener('mousedown', (e) => {
				isDragging = true;
				lastX = e.clientX;
				lastY = e.clientY;
			});
			
			canvas.addEventListener('mousemove', (e) => {
				if (isDragging && renderer) {
					const deltaX = e.clientX - lastX;
					const deltaY = e.clientY - lastY;
					
					// Update rotation deltas directly - these accumulate and are consumed by the update function
					renderer.controls.thetaDelta += deltaX * 0.01;
					renderer.controls.phiDelta += deltaY * 0.01;
					
					lastX = e.clientX;
					lastY = e.clientY;
					
					// Re-render with updated camera
					if (currentEntities.length > 0) {
						renderScene();
					}
				}
			});
			
			canvas.addEventListener('mouseup', () => {
				isDragging = false;
			});
			
			canvas.addEventListener('wheel', (e) => {
				e.preventDefault();
				if (renderer) {
					// Use controls.scale for zoom - smaller increments for smoother control
					// Decrease scale = zoom in, increase scale = zoom out
					const scaleDelta = e.deltaY > 0 ? 0.05 : -0.05;
					renderer.controls.scale = Math.max(0.1, Math.min(10, renderer.controls.scale + scaleDelta));
					
					console.log('Zoom:', { deltaY: e.deltaY, newScale: renderer.controls.scale });
					
					// Re-render with updated camera
					if (currentEntities.length > 0) {
						renderScene();
					}
				}
			});
		}

		function renderScene() {
			if (!renderer || !currentEntities || currentEntities.length === 0) {
				return;
			}
			
			try {
				// Update camera from controls
				const updated = renderer.orbitControls.update({
					controls: renderer.controls,
					camera: renderer.camera
				});
				
				// Carefully update only the properties that changed
				if (updated.controls) {
					Object.keys(updated.controls).forEach(key => {
						renderer.controls[key] = updated.controls[key];
					});
				}
				if (updated.camera) {
					Object.keys(updated.camera).forEach(key => {
						renderer.camera[key] = updated.camera[key];
					});
				}
				
				// Render the scene with grid and axes for debugging
				// Note: Grid and axes are rendered first to match official @jscad/regl-renderer demo pattern
				renderer.render({
					camera: renderer.camera,
					drawCommands: renderer.drawCommands,
					entities: [
						// Grid for reference
						{
							visuals: { drawCmd: 'drawGrid', show: true },
							size: [200, 200],
							ticks: [10, 1]
						},
						// Axes for orientation
						{
							visuals: { drawCmd: 'drawAxis', show: true },
							size: 50
						},
						// User entities last
						...currentEntities
					]
				});
				
				// Debug: log what we're rendering (keep lightweight)
				const first = currentEntities[0];
				if (first?.geometry?.indices?.length) {
					let maxIndex = 0;
					for (let i = 0; i < first.geometry.indices.length; i++) {
						const v = first.geometry.indices[i];
						if (v > maxIndex) maxIndex = v;
					}
					console.log('Rendering:', {
						userEntities: currentEntities.length,
						positions: first.geometry.positions?.length,
						indices: first.geometry.indices.length,
						maxIndex,
						visuals: first.visuals
					});
				}
			} catch (error) {
				console.error('Render error:', error);
				console.error('Error stack:', error.stack);
				showError('Render error: ' + error.message);
			}
		}

		function renderEntities(entities) {
			if (!renderer) {
				showError('Renderer not initialized');
				return;
			}

			try {
				// Any successful render should clear previous error overlays.
				clearError();
				// Convert arrays back to typed arrays for rendering
				// NOTE: @jscad/regl-renderer drawMesh forces element type to uint16.
				// Passing a Uint32Array here will corrupt indices (bytes interpreted as uint16),
				// producing the "spiky"/random-triangle artifacts we've been seeing.
				const processedEntities = entities.map((entity, entityIndex) => {
					// IMPORTANT: drop any incoming cacheId.
					// prepareRender() caches draw commands by visuals.cacheId, and the draw command
					// captures geometry buffers at creation time. If multiple entities share a cacheId,
					// they will incorrectly reuse buffers, producing "random" triangles / white blocks.
					const visuals = Object.assign({}, entity.visuals);
					delete visuals.cacheId;
					const processed = {
						visuals,
						geometry: {
							type: entity.geometry.type,
							isTransparent: entity.geometry.isTransparent
						},
						// Ensure consistent GL state for each mesh entity
						extras: {
							blend: { enable: false },
							polygonOffset: { enable: false },
							depth: { enable: true }
						}
					};

					// Help renderer sort transparent entities correctly.
					if (processed.geometry.isTransparent) {
						processed.visuals.transparent = true;
					}
					
					// Flatten nested arrays and convert to typed arrays
					if (entity.geometry.positions) {
						const positions = entity.geometry.positions;
						let flatPositions;
						if (Array.isArray(positions[0])) {
							flatPositions = positions.flat();
						} else if (typeof positions[0] === 'object') {
							flatPositions = positions.flatMap(p => [p[0], p[1], p[2]]);
						} else {
							flatPositions = positions;
						}
						processed.geometry.positions = new Float32Array(flatPositions);
					}
					if (entity.geometry.normals) {
						const normals = entity.geometry.normals;
						let flatNormals;
						if (Array.isArray(normals[0])) {
							flatNormals = normals.flat();
						} else if (typeof normals[0] === 'object') {
							flatNormals = normals.flatMap(n => [n[0], n[1], n[2]]);
						} else {
							flatNormals = normals;
						}
						processed.geometry.normals = new Float32Array(flatNormals);
					}
					if (entity.geometry.indices) {
						const indices = entity.geometry.indices;
						let flatIndices;
						if (Array.isArray(indices[0])) {
							flatIndices = indices.flat();
						} else if (typeof indices[0] === 'object') {
							flatIndices = indices.flatMap(i => [i[0], i[1], i[2]]);
						} else {
							flatIndices = indices;
						}
						let maxIndex = 0;
						for (let i = 0; i < flatIndices.length; i++) {
							const v = flatIndices[i];
							if (v > maxIndex) maxIndex = v;
						}
						if (maxIndex > 65535) {
							throw new Error('Mesh has index ' + maxIndex + ' (> 65535). drawMesh uses uint16 indices.');
						}
						processed.geometry.indices = new Uint16Array(flatIndices);
					}
					if (entity.geometry.colors) {
						const colors = entity.geometry.colors;
						let flatColors;
						if (Array.isArray(colors[0])) {
							flatColors = colors.flat();
						} else if (typeof colors[0] === 'object') {
							flatColors = colors.flatMap(c => [c[0], c[1], c[2], c[3] || 1.0]);
						} else {
							flatColors = colors;
						}
						processed.geometry.colors = new Float32Array(flatColors);
					}
					if (entity.geometry.transforms) {
						processed.geometry.transforms = new Float32Array(entity.geometry.transforms);
					}
					if (entity.geometry.points) {
						processed.geometry.points = new Float32Array(entity.geometry.points);
					}
					
					// Validate attribute lengths to avoid shaders reading garbage.
					// Garbage in normals/colors often shows up as "white blocks" or blown-out lighting.
					const positionsTA = processed.geometry.positions;
					if (positionsTA && positionsTA.length > 0) {
						const vertexCount = Math.floor(positionsTA.length / 3);
						const expectedNormals = vertexCount * 3;
						const expectedColors = vertexCount * 4;

						if (processed.geometry.normals && processed.geometry.normals.length !== expectedNormals) {
							console.warn('Normals length mismatch; replacing normals.', {
								entityIndex,
								got: processed.geometry.normals.length,
								expected: expectedNormals
							});
							const fallbackNormals = new Float32Array(expectedNormals);
							for (let i = 0; i < expectedNormals; i += 3) {
								fallbackNormals[i] = 0;
								fallbackNormals[i + 1] = 0;
								fallbackNormals[i + 2] = 1;
							}
							processed.geometry.normals = fallbackNormals;
						}

						if (processed.geometry.colors && processed.geometry.colors.length !== expectedColors) {
							console.warn('Colors length mismatch; disabling vertex colors for entity.', {
								entityIndex,
								got: processed.geometry.colors.length,
								expected: expectedColors
							});
							delete processed.geometry.colors;
							processed.visuals.useVertexColors = false;
							// Prefer any existing visuals.color, else a neutral gray.
							if (!processed.visuals.color) {
								processed.visuals.color = [0.7, 0.7, 0.7, 1.0];
							}
						}
					}

					return processed;
				});
				
				// Store entities for re-rendering on resize
				currentEntities = processedEntities;

				// Debug: show visuals (and ensure cacheId is not present)
				try {
					console.log('Current entities visuals:', currentEntities.map(e => e.visuals));
					console.log('Current entities cacheIds:', currentEntities.map(e => e.visuals && e.visuals.cacheId));
				} catch (e) {
					// ignore logging failures
				}

				// Auto-zoom to fit the geometry
				autoZoomToFit(processedEntities);

				// Render the scene with the pre-converted entities
				renderScene();
				
				loadingElement.style.display = 'none';
				statusElement.textContent = 'Status: Rendered ' + entities.length + ' entit' + (entities.length === 1 ? 'y' : 'ies');
			} catch (error) {
				showError('Rendering failed: ' + error.message);
			}
		}
		
		function autoZoomToFit(entities) {
			// Calculate bounding box of all entities
			let minX = Infinity, minY = Infinity, minZ = Infinity;
			let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
			let hasPositions = false;
			
			entities.forEach(entity => {
				if (entity.geometry && entity.geometry.positions) {
					hasPositions = true;
					const positions = entity.geometry.positions;
					for (let i = 0; i < positions.length; i += 3) {
						minX = Math.min(minX, positions[i]);
						minY = Math.min(minY, positions[i + 1]);
						minZ = Math.min(minZ, positions[i + 2]);
						maxX = Math.max(maxX, positions[i]);
						maxY = Math.max(maxY, positions[i + 1]);
						maxZ = Math.max(maxZ, positions[i + 2]);
					}
				}
			});
			
			// If no geometry found, use defaults
			if (!hasPositions || !isFinite(minX)) {
				console.log('No valid geometry bounds, skipping auto-zoom');
				return;
			}
			
			// Calculate center and size
			const centerX = (minX + maxX) / 2;
			const centerY = (minY + maxY) / 2;
			const centerZ = (minZ + maxZ) / 2;
			const sizeX = maxX - minX;
			const sizeY = maxY - minY;
			const sizeZ = maxZ - minZ;
			const maxSize = Math.max(sizeX, sizeY, sizeZ, 1); // at least 1 to avoid division by zero
			
			// Position camera to view the geometry
			const distance = maxSize * 2.5;
			
			// Directly update camera target and position values in place
			renderer.camera.target[0] = centerX;
			renderer.camera.target[1] = centerY;
			renderer.camera.target[2] = centerZ;
			
			renderer.camera.position[0] = centerX + distance * 0.5;
			renderer.camera.position[1] = centerY - distance * 0.7;
			renderer.camera.position[2] = centerZ + distance * 0.7;
			
			// Force view matrix recalculation by setting scale to trigger update
			renderer.controls.scale = 1.0;
			
			console.log('Auto-zoom:', { center: [centerX, centerY, centerZ], distance, maxSize, bounds: { minX, maxX, minY, maxY, minZ, maxZ } });
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
				const size = resizeCanvasToDisplaySize();
				
				// Update camera projection with new canvas size - merge results
				const updated = renderer.perspectiveCamera.setProjection(
					renderer.camera,
					renderer.camera,
					{ width: size.width, height: size.height }
				);
				renderer.camera = Object.assign({}, renderer.camera, updated);
				
				// Re-render on resize
				if (currentEntities.length > 0) {
					renderScene();
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
						// Update parameter panel if parameters are provided
						if (message.parameters) {
							updateParameterPanel(message.parameters);
						}
					} else {
						showError('No entity data received');
					}
					break;
				case 'error':
					showError(message.message);
					break;
			}
		});

		// Parameter panel management
		const parameterPanel = document.getElementById('parameter-panel');
		const parameterContent = document.getElementById('parameter-content');
		const parameterHeader = document.getElementById('parameter-header');
		const collapseButton = document.getElementById('collapse-button');
		let isCollapsed = false;
		let currentFilePath = '';

		// Toggle collapse
		parameterHeader.addEventListener('click', () => {
			isCollapsed = !isCollapsed;
			parameterContent.classList.toggle('collapsed', isCollapsed);
			collapseButton.textContent = isCollapsed ? '▶' : '▼';
		});

		function sendParameterChange(name, value) {
			console.log('Parameter changed:', name, value);
			vscode.postMessage({
				type: 'parameterChanged',
				name: name,
				value: value,
				filePath: currentFilePath
			});
		}

		// Helper function to determine if parameter should use slider input
		function shouldUseSlider(def) {
			return def.type === 'slider' || ((def.type === 'number' || def.type === 'int' || def.type === 'float') && def.min !== undefined && def.max !== undefined);
		}

		function updateParameterPanel(parameters) {
			const { definitions, values, filePath } = parameters;
			currentFilePath = filePath;
			
			if (!definitions || definitions.length === 0) {
				parameterPanel.classList.remove('visible');
				return;
			}

			// Clear existing content
			parameterContent.innerHTML = '';

			// Create inputs for each parameter
			definitions.forEach(def => {
				const paramDiv = document.createElement('div');
				paramDiv.className = 'parameter-item';

				const label = document.createElement('label');
				label.className = 'parameter-label';
				label.textContent = def.caption || def.name;

				let input;
				const currentValue = values[def.name];

				if (def.type === 'checkbox') {
					const checkboxLabel = document.createElement('label');
					checkboxLabel.className = 'parameter-checkbox-label';
					
					input = document.createElement('input');
					input.type = 'checkbox';
					input.className = 'parameter-input parameter-checkbox';
					input.checked = currentValue;
					input.addEventListener('change', () => {
						sendParameterChange(def.name, input.checked);
					});
					
					checkboxLabel.appendChild(input);
					checkboxLabel.appendChild(document.createTextNode(def.caption || def.name));
					paramDiv.appendChild(checkboxLabel);
				} else if (def.type === 'choice') {
					paramDiv.appendChild(label);
					
					input = document.createElement('select');
					input.className = 'parameter-input';
					
					(def.values || []).forEach((value, index) => {
						const option = document.createElement('option');
						option.value = String(value);
						option.textContent = (def.captions && def.captions[index]) || String(value);
						if (currentValue !== undefined && String(value) === String(currentValue)) {
							option.selected = true;
						}
						input.appendChild(option);
					});
					
					input.addEventListener('change', () => {
						const selectedIndex = input.selectedIndex;
						const valuesArray = def.values || [];
						const selectedValue = valuesArray[selectedIndex];
						sendParameterChange(def.name, selectedValue !== undefined ? selectedValue : input.value);
					});
					
					paramDiv.appendChild(input);
				} else if (shouldUseSlider(def)) {
					paramDiv.appendChild(label);
					
					input = document.createElement('input');
					input.type = 'range';
					input.className = 'parameter-input parameter-slider';
					input.min = def.min !== undefined ? def.min : 0;
					input.max = def.max !== undefined ? def.max : 100;
					input.step = def.step !== undefined ? def.step : 1;
					input.value = currentValue;
					
					const valueDisplay = document.createElement('div');
					valueDisplay.className = 'parameter-value';
					valueDisplay.textContent = 'Value: ' + currentValue;
					
					input.addEventListener('input', () => {
						valueDisplay.textContent = 'Value: ' + input.value;
					});
					
					input.addEventListener('change', () => {
						const value = def.type === 'int' ? parseInt(input.value) : parseFloat(input.value);
						sendParameterChange(def.name, value);
					});
					
					paramDiv.appendChild(input);
					paramDiv.appendChild(valueDisplay);
				} else {
					// Default to text input for number, text, etc.
					paramDiv.appendChild(label);
					
					input = document.createElement('input');
					input.className = 'parameter-input';
					
					if (def.type === 'number' || def.type === 'int' || def.type === 'float') {
						input.type = 'number';
						if (def.min !== undefined) input.min = def.min;
						if (def.max !== undefined) input.max = def.max;
						if (def.step !== undefined) {
							input.step = def.step;
						} else {
							input.step = def.type === 'int' ? '1' : 'any';
						}
					} else if (def.type === 'color') {
						input.type = 'color';
					} else if (def.type === 'date') {
						input.type = 'date';
					} else if (def.type === 'email') {
						input.type = 'email';
					} else if (def.type === 'password') {
						input.type = 'password';
					} else if (def.type === 'url') {
						input.type = 'url';
					} else {
						input.type = 'text';
					}
					
					// Ensure int values are displayed as integers
					input.value = def.type === 'int' && typeof currentValue === 'number' 
						? String(Math.floor(currentValue))
						: String(currentValue);
					
					input.addEventListener('change', () => {
						let value = input.value;
						if (def.type === 'number' || def.type === 'float') {
							const parsed = parseFloat(value);
							value = isNaN(parsed)
								? (def.initial !== undefined
									? def.initial
									: (def.min !== undefined ? def.min : undefined))
								: parsed;
						} else if (def.type === 'int') {
							const parsed = parseInt(value);
							value = isNaN(parsed)
								? (def.initial !== undefined
									? def.initial
									: (def.min !== undefined ? def.min : undefined))
								: parsed;
						}
						sendParameterChange(def.name, value);
					});
					
					paramDiv.appendChild(input);
				}

				parameterContent.appendChild(paramDiv);
			});

			// Show the panel
			parameterPanel.classList.add('visible');
		}

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
