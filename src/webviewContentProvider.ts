import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Provides HTML content for the webview preview panel
 * Handles template generation and resource URI management
 */
export class WebviewContentProvider {
private context: vscode.ExtensionContext;

constructor(context: vscode.ExtensionContext) {
this.context = context;
}

/**
 * Generate complete HTML content for the webview
 */
getWebviewContent(webview: vscode.Webview): string {
// Get resource URIs
const threeUri = this.getThreeJsUri(webview);
const converterUri = this.getConverterUri(webview);
const parameterUIUri = this.getParameterUIUri(webview);

// Read CSS from file
const styles = this.readStylesFromFile();

return this.generateHtmlTemplate(threeUri, converterUri, parameterUIUri, styles);
}

/**
 * Get the webview URI for Three.js module
 */
private getThreeJsUri(webview: vscode.Webview): vscode.Uri {
const threePath = vscode.Uri.joinPath(
this.context.extensionUri,
'node_modules',
'three',
'build',
'three.module.js'
);
return webview.asWebviewUri(threePath);
}

/**
 * Get the webview URI for converter module
 */
private getConverterUri(webview: vscode.Webview): vscode.Uri {
const converterPath = vscode.Uri.joinPath(
this.context.extensionUri,
'src',
'webview',
'converter.js'
);
return webview.asWebviewUri(converterPath);
}

/**
 * Get the webview URI for parameter UI module
 */
private getParameterUIUri(webview: vscode.Webview): vscode.Uri {
const parameterUIPath = vscode.Uri.joinPath(
this.context.extensionUri,
'src',
'webview',
'parameterUI.js'
);
return webview.asWebviewUri(parameterUIPath);
}

/**
 * Read CSS styles from file
 */
private readStylesFromFile(): string {
const cssPath = path.join(
this.context.extensionPath,
'src',
'webview',
'preview.css'
);
try {
return fs.readFileSync(cssPath, 'utf8');
} catch (error) {
console.error('Failed to read CSS file:', cssPath, error);
// Return empty string as fallback
return '';
}
}

/**
 * Generate the complete HTML template
 */
private generateHtmlTemplate(
threeUri: vscode.Uri,
converterUri: vscode.Uri,
parameterUIUri: vscode.Uri,
styles: string
): string {
return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HootCAD Preview</title>
<style>
${styles}
</style>
</head>
<body>
${this.getBodyContent()}
<script type="module">
import * as THREE from '${threeUri}';
import { convertGeom3ToBufferGeometry, convertGeom2ToLineGeometry } from '${converterUri}';
import { updateParameterUI } from '${parameterUIUri}';

${this.getClientScript()}
</script>
</body>
</html>`;
}

/**
 * Get HTML body content
 */
private getBodyContent(): string {
return `
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
`;
}

/**
 * Get client-side JavaScript for Three.js rendering and interaction
 */
private getClientScript(): string {
return `
const vscode = acquireVsCodeApi();
const canvas = document.getElementById('renderCanvas');
const statusElement = document.getElementById('status');
const loadingElement = document.getElementById('loading');
const errorElement = document.getElementById('error-message');
const parameterPanel = document.getElementById('parameter-panel');
const parameterContent = document.getElementById('parameter-content');
const collapseButton = document.getElementById('collapse-button');

// Three.js scene setup
let scene, camera, renderer, controls;
let meshGroup = new THREE.Group();
let animationFrameId = null;
let hasRenderedOnce = false; // Track if we've done initial render with auto-zoom
let userHasInteracted = false; // Track if user has moved camera

// Manual orbit-control state (shared by auto-fit + user input)
let cameraTarget = new THREE.Vector3(0, 0, 0);
let cameraRotation = { theta: Math.PI / 4, phi: Math.PI / 4 };
let cameraDistance = 50;

function updateCameraPosition() {
	const sinPhi = Math.sin(cameraRotation.phi);
	camera.position.x = cameraTarget.x + cameraDistance * sinPhi * Math.cos(cameraRotation.theta);
	camera.position.y = cameraTarget.y + cameraDistance * Math.cos(cameraRotation.phi);
	camera.position.z = cameraTarget.z + cameraDistance * sinPhi * Math.sin(cameraRotation.theta);
	camera.lookAt(cameraTarget);
}

function syncControlsFromCamera() {
	const offset = new THREE.Vector3().subVectors(camera.position, cameraTarget);
	cameraDistance = offset.length();
	if (cameraDistance < 1e-6) return;
	cameraRotation.theta = Math.atan2(offset.z, offset.x);
	const cosPhi = offset.y / cameraDistance;
	cameraRotation.phi = Math.acos(Math.max(-1, Math.min(1, cosPhi)));
}

// Initialize Three.js
function initThreeJS() {
// Scene
scene = new THREE.Scene();
scene.background = new THREE.Color(0xf5f5f5); // Near-white background

// Camera
const aspect = canvas.clientWidth / canvas.clientHeight;
camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
camera.position.set(30, 30, 30);

cameraTarget.set(0, 0, 0);
camera.lookAt(cameraTarget);
syncControlsFromCamera();

// Renderer
renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(canvas.clientWidth, canvas.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Lights - studio-style setup
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

// Key light (main)
const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
keyLight.position.set(20, 30, 20);
keyLight.castShadow = true;
scene.add(keyLight);

// Fill light (softer, from opposite side)
const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
fillLight.position.set(-20, 10, -10);
scene.add(fillLight);

// Rim light (from behind/below for edge definition)
const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
rimLight.position.set(0, -10, -20);
scene.add(rimLight);

// Grid and axes - subtle gray/blue grid
// 400mm x 400mm grid (typical 3D printer build plate size) with 40 divisions (10mm each)
const gridHelper = new THREE.GridHelper(400, 40, 0x8899aa, 0xc5d0dd);
scene.add(gridHelper);

const axesHelper = new THREE.AxesHelper(100);
scene.add(axesHelper);

// Add mesh group
scene.add(meshGroup);

// Basic orbit controls (manual implementation)
setupControls();

// Handle window resize using ResizeObserver
// Watch the canvas-container instead of the canvas itself
const container = document.getElementById('canvas-container');
const resizeObserver = new ResizeObserver((entries) => {
for (const entry of entries) {
console.log('ResizeObserver triggered:', entry.contentRect.width, 'x', entry.contentRect.height);
onWindowResize();
}
});
resizeObserver.observe(container);

// Start render loop
animate();

console.log('Three.js initialized');
statusElement.textContent = 'Status: Ready';
loadingElement.style.display = 'none';
}

function setupControls() {
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

canvas.addEventListener('mousedown', (e) => {
isDragging = true;
userHasInteracted = true; // Mark that user has interacted
previousMousePosition = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('mousemove', (e) => {
if (!isDragging) return;

const deltaX = e.clientX - previousMousePosition.x;
const deltaY = e.clientY - previousMousePosition.y;

cameraRotation.theta += deltaX * 0.01;
cameraRotation.phi -= deltaY * 0.01;
cameraRotation.phi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraRotation.phi));

updateCameraPosition();

previousMousePosition = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('mouseup', () => {
isDragging = false;
});

canvas.addEventListener('mouseleave', () => {
isDragging = false;
});

canvas.addEventListener('wheel', (e) => {
e.preventDefault();
userHasInteracted = true; // Mark that user has interacted
cameraDistance += e.deltaY * 0.05;
cameraDistance = Math.max(5, Math.min(200, cameraDistance));
updateCameraPosition();
});
}

function onWindowResize() {
const container = document.getElementById('canvas-container');
const width = container.clientWidth;
const height = container.clientHeight;
console.log('Resize detected:', width, 'x', height);

// Update camera aspect ratio
camera.aspect = width / height;
camera.updateProjectionMatrix();

// Update renderer size - this updates the canvas drawing buffer
renderer.setSize(width, height);

// Ensure pixel ratio is maintained
renderer.setPixelRatio(window.devicePixelRatio);
}

function animate() {
animationFrameId = requestAnimationFrame(animate);
renderer.render(scene, camera);
}

function clearScene() {
while (meshGroup.children.length > 0) {
const child = meshGroup.children[0];
meshGroup.remove(child);
if (child.geometry) child.geometry.dispose();
if (child.material) child.material.dispose();
}
}

function fitCameraToObjects() {
	// Calculate bounding box of all objects in the mesh group
	const box = new THREE.Box3();
	
	if (meshGroup.children.length === 0) {
		console.log('No objects to fit camera to');
		return;
	}

	// Ensure world matrices are up-to-date before computing bounds
	meshGroup.updateMatrixWorld(true);
	
	// Expand box to include all objects
	meshGroup.children.forEach(child => {
		const childBox = new THREE.Box3().setFromObject(child);
		box.union(childBox);
	});
	
	// Get the center and size of the bounding box
	const center = new THREE.Vector3();
	const size = new THREE.Vector3();
	box.getCenter(center);
	box.getSize(size);
	
	// Calculate the maximum dimension
	const maxDim = Math.max(size.x, size.y, size.z);
	
	// If objects are too small, use a minimum size
	const minSize = 10;
	const effectiveSize = Math.max(maxDim, minSize);
	
	// Calculate distance needed to fit the object in view
	// Use field of view to determine how far back the camera needs to be
	const fov = camera.fov * (Math.PI / 180); // Convert to radians
	const distance = effectiveSize / (2 * Math.tan(fov / 2));
	
	// Add some padding (1.5x distance for comfortable view)
	const paddedDistance = distance * 1.5;
	
	// Update shared orbit state so the first user interaction doesn't "snap" the camera.
	cameraTarget.copy(center);
	cameraDistance = paddedDistance;
	// Default to 45-45 degrees view for initial fit.
	cameraRotation.theta = Math.PI / 4;
	cameraRotation.phi = Math.PI / 4;
	updateCameraPosition();
	
	console.log('Camera fitted to objects:', {
		center: center,
		size: size,
		maxDim: maxDim,
		distance: paddedDistance,
		cameraPos: camera.position
	});
}

function renderGeometries(geometries) {
console.log('Rendering', geometries.length, 'geometries');
clearScene();

for (const geom of geometries) {
try {
if (geom.type === 'geom3') {
const geometry = convertGeom3ToBufferGeometry(geom, THREE);

// Determine color - use geom color if available, otherwise default metal gray
let color = 0xb0b8c0; // Light metal gray
if (geom.color && Array.isArray(geom.color) && geom.color.length >= 3) {
// Convert from [r, g, b, a] (0-1) to hex color
const r = Math.round(geom.color[0] * 255);
const g = Math.round(geom.color[1] * 255);
const b = Math.round(geom.color[2] * 255);
color = (r << 16) | (g << 8) | b;
}

const material = new THREE.MeshStandardMaterial({
color: color,
metalness: 0.5,
roughness: 0.5,
side: THREE.DoubleSide
});
const mesh = new THREE.Mesh(geometry, material);

// Apply transforms if available
if (geom.transforms && Array.isArray(geom.transforms) && geom.transforms.length === 16) {
// JSCAD uses column-major order, Three.js uses column-major too
const matrix = new THREE.Matrix4();
matrix.fromArray(geom.transforms);
matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
}

meshGroup.add(mesh);
console.log('Added geom3 mesh with color:', color.toString(16));
} else if (geom.type === 'geom2') {
const geometry = convertGeom2ToLineGeometry(geom, THREE);

// Determine color - use geom color if available, otherwise default dark blue
let color = 0x2266cc; // Dark blue for visibility on white
if (geom.color && Array.isArray(geom.color) && geom.color.length >= 3) {
const r = Math.round(geom.color[0] * 255);
const g = Math.round(geom.color[1] * 255);
const b = Math.round(geom.color[2] * 255);
color = (r << 16) | (g << 8) | b;
}

const material = new THREE.LineBasicMaterial({ color: color, linewidth: 2 });
const line = new THREE.LineSegments(geometry, material);

// Apply transforms if available
if (geom.transforms && Array.isArray(geom.transforms) && geom.transforms.length === 16) {
const matrix = new THREE.Matrix4();
matrix.fromArray(geom.transforms);
matrix.decompose(line.position, line.quaternion, line.scale);
}

meshGroup.add(line);
console.log('Added geom2 lines');
}
} catch (error) {
console.error('Error converting geometry:', error);
}
}

statusElement.textContent = 'Status: Rendered ' + geometries.length + ' object(s)';

// Auto-zoom to fit all objects, but only on the first render and if user hasn't interacted
if (!hasRenderedOnce && !userHasInteracted) {
	console.log('Performing initial auto-zoom to fit objects');
	fitCameraToObjects();
	hasRenderedOnce = true;
}
}

function showError(message) {
errorElement.textContent = message;
errorElement.style.display = 'block';
statusElement.textContent = 'Status: Error';
}

function hideError() {
errorElement.style.display = 'none';
}

// Parameter panel collapse
document.getElementById('parameter-header').addEventListener('click', () => {
parameterContent.classList.toggle('collapsed');
collapseButton.textContent = parameterContent.classList.contains('collapsed') ? '▶' : '▼';
});

// Message handling
window.addEventListener('message', (event) => {
const message = event.data;
switch (message.type) {
case 'renderEntities':
	hideError();
	renderGeometries(message.entities);
	if (message.parameters) {
		updateParameterUI(message.parameters, parameterPanel, parameterContent, vscode);
	}
	break;
case 'error':
	showError(message.message);
	break;
case 'resetView':
	// Allow manual reset of view - useful for debugging or user request
	hasRenderedOnce = false;
	userHasInteracted = false;
	break;
}
});

// Initialize
initThreeJS();

// Signal ready
vscode.postMessage({ type: 'ready' });
`;
	}
}

