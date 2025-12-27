import * as vscode from 'vscode';
import { resolveJscadEntrypoint, executeJscadFile, GeometryData } from './jscadEngine';

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
			retainContextWhenHidden: true
		}
	);

	// Set HTML content
	currentPanel.webview.html = getWebviewContent();

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

		const geometryData = await executeJscadFile(filePath, outputChannel);

		if (currentPanel) {
			currentPanel.webview.postMessage({
				type: 'renderGeometry',
				geometry: geometryData
			});
			outputChannel.appendLine('Geometry data sent to webview');
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

function getWebviewContent(): string {
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
		
		let gl = null;
		let currentGeometry = null;
		let geometryBuffers = []; // Track buffers for cleanup
		let camera = {
			position: [0, 0, 50],
			target: [0, 0, 0],
			rotation: { x: 0, y: 0 }
		};

		// Mouse interaction state
		let isDragging = false;
		let lastMouseX = 0;
		let lastMouseY = 0;

		// Initialize WebGL
		function initWebGL() {
			gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
			if (!gl) {
				showError('WebGL not supported in this browser');
				return false;
			}
			
			// Set canvas size
			resizeCanvas();
			
			gl.clearColor(0.12, 0.12, 0.12, 1.0);
			gl.enable(gl.DEPTH_TEST);
			gl.enable(gl.CULL_FACE);
			
			return true;
		}

		function resizeCanvas() {
			const container = canvas.parentElement;
			canvas.width = container.clientWidth;
			canvas.height = container.clientHeight;
			if (gl) {
				gl.viewport(0, 0, canvas.width, canvas.height);
			}
		}

		// Simple shader programs
		const vertexShaderSource = \`
			attribute vec3 aPosition;
			uniform mat4 uModelViewProjection;
			varying vec3 vColor;
			
			void main() {
				gl_Position = uModelViewProjection * vec4(aPosition, 1.0);
				// Simple color based on position
				vColor = vec3(0.5) + aPosition * 0.02;
			}
		\`;

		const fragmentShaderSource = \`
			precision mediump float;
			varying vec3 vColor;
			
			void main() {
				gl_FragColor = vec4(vColor, 1.0);
			}
		\`;

		let shaderProgram = null;
		let programInfo = null;

		function initShaders() {
			const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
			const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
			
			shaderProgram = gl.createProgram();
			gl.attachShader(shaderProgram, vertexShader);
			gl.attachShader(shaderProgram, fragmentShader);
			gl.linkProgram(shaderProgram);
			
			if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
				showError('Shader program failed to link');
				return false;
			}
			
			programInfo = {
				program: shaderProgram,
				attribLocations: {
					position: gl.getAttribLocation(shaderProgram, 'aPosition'),
				},
				uniformLocations: {
					modelViewProjection: gl.getUniformLocation(shaderProgram, 'uModelViewProjection'),
				},
			};
			
			return true;
		}

		function createShader(type, source) {
			const shader = gl.createShader(type);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
				gl.deleteShader(shader);
				return null;
			}
			
			return shader;
		}

		function renderGeometry(geometryData) {
			if (!gl || !programInfo) return;
			
			// Clean up old buffers before creating new ones
			cleanupBuffers();
			
			currentGeometry = geometryData;
			
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			gl.useProgram(programInfo.program);
			
			for (const geom of geometryData) {
				if (geom.type === 'geom3' && geom.positions && geom.indices) {
					renderGeom3(geom);
				}
			}
			
			loadingElement.style.display = 'none';
			statusElement.textContent = 'Status: Geometry rendered';
		}

		function cleanupBuffers() {
			// Delete all tracked buffers to prevent memory leaks
			for (const buffer of geometryBuffers) {
				if (buffer) {
					gl.deleteBuffer(buffer);
				}
			}
			geometryBuffers = [];
		}

		function renderGeom3(geom) {
			// Flatten positions array
			const positions = new Float32Array(geom.positions.flat());
			const indices = new Uint16Array(geom.indices);
			
			// Create buffers
			const positionBuffer = gl.createBuffer();
			geometryBuffers.push(positionBuffer); // Track for cleanup
			gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
			
			const indexBuffer = gl.createBuffer();
			geometryBuffers.push(indexBuffer); // Track for cleanup
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
			gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
			
			// Set up position attribute
			gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
			gl.vertexAttribPointer(
				programInfo.attribLocations.position,
				3, // size
				gl.FLOAT, // type
				false, // normalize
				0, // stride
				0 // offset
			);
			gl.enableVertexAttribArray(programInfo.attribLocations.position);
			
			// Create transformation matrices
			const projectionMatrix = createPerspectiveMatrix(
				45 * Math.PI / 180, // fov
				canvas.width / canvas.height, // aspect
				0.1, // near
				1000.0 // far
			);
			
			const viewMatrix = createLookAtMatrix(
				camera.position,
				camera.target,
				[0, 1, 0]
			);
			
			const rotationMatrix = createRotationMatrix(camera.rotation.x, camera.rotation.y);
			const modelViewMatrix = multiplyMatrices(viewMatrix, rotationMatrix);
			const mvpMatrix = multiplyMatrices(projectionMatrix, modelViewMatrix);
			
			gl.uniformMatrix4fv(
				programInfo.uniformLocations.modelViewProjection,
				false,
				mvpMatrix
			);
			
			// Draw
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
			gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
		}

		// Matrix math helpers
		function createPerspectiveMatrix(fov, aspect, near, far) {
			const f = 1.0 / Math.tan(fov / 2);
			const rangeInv = 1.0 / (near - far);
			
			return new Float32Array([
				f / aspect, 0, 0, 0,
				0, f, 0, 0,
				0, 0, (near + far) * rangeInv, -1,
				0, 0, near * far * rangeInv * 2, 0
			]);
		}

		function createLookAtMatrix(eye, target, up) {
			const z = normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
			const x = normalize(cross(up, z));
			const y = cross(z, x);
			
			return new Float32Array([
				x[0], y[0], z[0], 0,
				x[1], y[1], z[1], 0,
				x[2], y[2], z[2], 0,
				-dot(x, eye), -dot(y, eye), -dot(z, eye), 1
			]);
		}

		function createRotationMatrix(rotX, rotY) {
			const cosX = Math.cos(rotX);
			const sinX = Math.sin(rotX);
			const cosY = Math.cos(rotY);
			const sinY = Math.sin(rotY);
			
			return new Float32Array([
				cosY, sinX * sinY, -cosX * sinY, 0,
				0, cosX, sinX, 0,
				sinY, -sinX * cosY, cosX * cosY, 0,
				0, 0, 0, 1
			]);
		}

		function multiplyMatrices(a, b) {
			const result = new Float32Array(16);
			for (let i = 0; i < 4; i++) {
				for (let j = 0; j < 4; j++) {
					result[i * 4 + j] = 
						a[i * 4 + 0] * b[0 * 4 + j] +
						a[i * 4 + 1] * b[1 * 4 + j] +
						a[i * 4 + 2] * b[2 * 4 + j] +
						a[i * 4 + 3] * b[3 * 4 + j];
				}
			}
			return result;
		}

		function normalize(v) {
			const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
			return [v[0] / len, v[1] / len, v[2] / len];
		}

		function cross(a, b) {
			return [
				a[1] * b[2] - a[2] * b[1],
				a[2] * b[0] - a[0] * b[2],
				a[0] * b[1] - a[1] * b[0]
			];
		}

		function dot(a, b) {
			return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
		}

		function showError(message) {
			errorElement.textContent = message;
			errorElement.style.display = 'block';
			loadingElement.style.display = 'none';
			statusElement.textContent = 'Status: Error - ' + message;
		}

		// Mouse interaction
		canvas.addEventListener('mousedown', (e) => {
			isDragging = true;
			lastMouseX = e.clientX;
			lastMouseY = e.clientY;
		});

		canvas.addEventListener('mousemove', (e) => {
			if (!isDragging) return;
			
			const deltaX = e.clientX - lastMouseX;
			const deltaY = e.clientY - lastMouseY;
			
			camera.rotation.y += deltaX * 0.01;
			camera.rotation.x += deltaY * 0.01;
			
			lastMouseX = e.clientX;
			lastMouseY = e.clientY;
			
			if (currentGeometry) {
				renderGeometry(currentGeometry);
			}
		});

		canvas.addEventListener('mouseup', () => {
			isDragging = false;
		});

		canvas.addEventListener('mouseleave', () => {
			isDragging = false;
		});

		// Zoom with mouse wheel
		canvas.addEventListener('wheel', (e) => {
			e.preventDefault();
			const delta = e.deltaY > 0 ? 1.1 : 0.9;
			camera.position[2] *= delta;
			
			if (currentGeometry) {
				renderGeometry(currentGeometry);
			}
		});

		// Handle window resize
		window.addEventListener('resize', () => {
			resizeCanvas();
			if (currentGeometry) {
				renderGeometry(currentGeometry);
			}
		});

		// Listen for messages from extension
		window.addEventListener('message', event => {
			const message = event.data;
			switch (message.type) {
				case 'renderGeometry':
					if (message.geometry && message.geometry.length > 0) {
						renderGeometry(message.geometry);
					} else {
						showError('No geometry data received');
					}
					break;
				case 'error':
					showError(message.message);
					break;
			}
		});

		// Initialize
		if (initWebGL() && initShaders()) {
			statusElement.textContent = 'Status: Ready';
			vscode.postMessage({ type: 'ready' });
		} else {
			showError('Failed to initialize WebGL renderer');
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
