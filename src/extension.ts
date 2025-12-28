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
				renderer.render({
					camera: renderer.camera,
					drawCommands: renderer.drawCommands,
					entities: [
						// User entities first (avoid helper state leaking into mesh draws)
						...currentEntities,
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
						}
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
						// Ensure drawMesh doesn't inherit GL state (blend/polygonOffset/etc)
						// from previously drawn helpers like the grid.
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
