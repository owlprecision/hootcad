/* global acquireVsCodeApi */

// Static imports - webpack will bundle these
import * as THREE from 'three';
import { PhotonicScene } from '@codecube/photonic';
import { convertGeom3ToBufferGeometry, convertGeom2ToLineGeometry } from './converter.js';
import { updateParameterUI } from './parameterUI.js';

(function () {
	function showBootError(error) {
		const errorElement = document.getElementById('error-message');
		const statusElement = document.getElementById('status');
		if (errorElement) {
			errorElement.textContent = String(error?.message || error);
			errorElement.style.display = 'block';
		}
		if (statusElement) {
			statusElement.textContent = 'Status: Error';
		}
		console.error('Renderer bootstrap failed:', error);
	}

	(async () => {
		const vscode = acquireVsCodeApi();

		const container = document.getElementById('canvas-container');
		const placeholderCanvas = document.getElementById('renderCanvas');
		const statusElement = document.getElementById('status');
		const loadingElement = document.getElementById('loading');
		const errorElement = document.getElementById('error-message');
		const parameterPanel = document.getElementById('parameter-panel');
		const parameterContent = document.getElementById('parameter-content');
		const collapseButton = document.getElementById('collapse-button');
		const snapshotButton = document.getElementById('snapshot-button');
		const clearReferenceButton = document.getElementById('clear-reference-button');

		if (!container) {
			throw new Error('Missing #canvas-container');
		}
		if (!statusElement) {
			throw new Error('Missing #status');
		}
		if (!loadingElement) {
			throw new Error('Missing #loading');
		}
		if (!errorElement) {
			throw new Error('Missing #error-message');
		}
		if (!parameterPanel) {
			throw new Error('Missing #parameter-panel');
		}
		if (!parameterContent) {
			throw new Error('Missing #parameter-content');
		}
		if (!collapseButton) {
			throw new Error('Missing #collapse-button');
		}

		// The preview's settled look: the bright engineering setting HootCAD already
		// has (light background, grid, multi-direction light), with Photonic's
		// rendering quality on top (ACES grade, soft shadows, baked contact shading).
		const LOOK = {
			background: 0xf5f5f5,
			exposure: 1.05,
			ambientIntensity: 0.75,
			hemiIntensity: 0.9,
			fillIntensity: 0.55,
			rimIntensity: 0.35,
			stageSize: 10
		};

		const MATERIAL_PRESET = {
			metalness: 0.15,
			roughness: 0.65
		};

		function clamp01(value) {
			if (typeof value !== 'number' || Number.isNaN(value)) {
				return 1;
			}
			return Math.max(0, Math.min(1, value));
		}

		function getColorHexAndOpacity(geom, defaultHex) {
			let colorHex = defaultHex;
			let opacity = 1;
			if (geom?.color && Array.isArray(geom.color) && geom.color.length >= 3) {
				const r = Math.round(clamp01(geom.color[0]) * 255);
				const g = Math.round(clamp01(geom.color[1]) * 255);
				const b = Math.round(clamp01(geom.color[2]) * 255);
				colorHex = (r << 16) | (g << 8) | b;
				if (geom.color.length >= 4) {
					opacity = clamp01(geom.color[3]);
				}
			}
			return { colorHex, opacity };
		}

		let photonicScene = null;
		let currentBounds = null;
		let currentDesignScale = null;
		let hasRenderedOnce = false;
		let userHasInteracted = false;

		// Reference geometry: a model file loaded for fit checks alongside the
		// designed part. It lives in the Photonic scene only — never in the
		// JSCAD model, its parameters, or its exports.
		let referenceHandle = null;
		let referenceInfo = null;
		let referenceName = null;

		// Function names in this file are kept stable: the webview content tests
		// check the bundled renderer for them (src/test/webviewContent.test.ts).
		function initThreeJS() {
			// Photonic owns the canvas; it takes over the placeholder's place and id.
			if (placeholderCanvas) {
				placeholderCanvas.remove();
			}
			photonicScene = new PhotonicScene(container, { exposure: LOOK.exposure });
			photonicScene.renderer.renderer.domElement.id = 'renderCanvas';

			photonicScene.setBackgroundColor(LOOK.background);
			photonicScene.setAmbientLight({ intensity: LOOK.ambientIntensity, color: 0xffffff });
			photonicScene.setGridVisible(true);
			photonicScene.setFloorVisible(true);

			// Hemisphere, fill, and rim lights keep the bright, even engineering
			// illumination the old hand-rolled rig had; Photonic's own directional
			// light stays the only shadow caster and is refit per model below.
			const hemiLight = new THREE.HemisphereLight(0xffffff, 0x9aa6b2, LOOK.hemiIntensity);
			photonicScene.scene.add(hemiLight);
			const fillLight = new THREE.DirectionalLight(0xffffff, LOOK.fillIntensity);
			fillLight.position.set(20, 12, 10);
			photonicScene.scene.add(fillLight);
			const rimLight = new THREE.DirectionalLight(0xffffff, LOOK.rimIntensity);
			rimLight.position.set(-10, 8, -20);
			photonicScene.scene.add(rimLight);

			if (photonicScene.camera?.controls) {
				photonicScene.camera.controls.addEventListener('start', () => {
					userHasInteracted = true;
				});
			}

			if (typeof ResizeObserver !== 'undefined') {
				const resizeObserver = new ResizeObserver(() => {
					photonicScene.handleResize();
				});
				resizeObserver.observe(container);
			}

			// Test hook: lets the packaged-build harness verify the live scene.
			window.__hootcadPhotonic = photonicScene;

			statusElement.textContent = 'Status: Ready';
			loadingElement.style.display = 'none';
		}

		function fitCameraToObjects() {
			if (!photonicScene || !currentBounds) {
				return;
			}
			const { center, size } = currentBounds;
			const maxDim = Math.max(size.x, size.y, size.z);

			photonicScene.setCameraTarget(center.x, center.y, center.z);
			// Frame the bounding sphere inside the vertical field of view, so a
			// wide, flat model fills the view the way the old fit did.
			const radius = size.length() / 2;
			const halfFov = THREE.MathUtils.degToRad(photonicScene.camera.camera.fov) / 2;
			const distance = Math.max(maxDim * 0.9, (radius / Math.sin(halfFov)) * 1.02);
			const direction = new THREE.Vector3(0.62, 0.5, 0.62).normalize();
			photonicScene.setCameraPosition(
				center.x + direction.x * distance,
				center.y + direction.y * distance,
				center.z + direction.z * distance
			);
			if (photonicScene.camera?.controls) {
				photonicScene.camera.controls.maxDistance = Math.max(50, distance * 4);
			}

			// Refit Photonic's shadow-casting key light to the model, the same
			// tightening the old renderer did on every fit.
			const keyLight = photonicScene.defaultDirectionalLight;
			if (keyLight) {
				keyLight.position.set(-maxDim * 1.6, maxDim * 2.4, maxDim * 1.3);
				keyLight.target.position.set(center.x, center.y, center.z);
				keyLight.target.updateMatrixWorld(true);
				const extent = Math.max(4, maxDim * 0.85);
				keyLight.shadow.camera.left = -extent;
				keyLight.shadow.camera.right = extent;
				keyLight.shadow.camera.top = extent;
				keyLight.shadow.camera.bottom = -extent;
				keyLight.shadow.camera.near = 1;
				keyLight.shadow.camera.far = maxDim * 8 + 40;
				keyLight.shadow.camera.updateProjectionMatrix();
			}
		}

		// The host sends the picked file's bytes; normalize whatever shape they
		// arrive in (ArrayBuffer, typed array, or plain array) to an ArrayBuffer
		// for the loader.
		function toModelArrayBuffer(data) {
			if (data instanceof ArrayBuffer) {
				return data;
			}
			if (ArrayBuffer.isView(data)) {
				return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
			}
			if (Array.isArray(data)) {
				return new Uint8Array(data).buffer;
			}
			return null;
		}

		async function loadReferenceModel(name, data, hand = {}) {
			if (!photonicScene) {
				return;
			}
			const buffer = toModelArrayBuffer(data);
			if (!buffer) {
				showError('Could not load reference model "' + name + '": no model data arrived.');
				return;
			}
			clearReferenceModel();
			try {
				// Photonic F13/F14: the parsed model is adopted like any scene
				// object. The host names the format from the picked file's
				// extension, and an OBJ's material file rides along as mtlData
				// when the host found one beside the OBJ. disposeOnRemove stays
				// off so a design re-render — which clears every registered
				// object — can re-adopt the same model instead of disposing it
				// (see renderGeometries).
				const loadOptions = {
					data: buffer,
					name: 'Reference: ' + name,
					disposeOnRemove: false
				};
				if (hand.format) {
					loadOptions.format = hand.format;
				}
				const mtlBuffer = hand.mtlData ? toModelArrayBuffer(hand.mtlData) : null;
				if (mtlBuffer) {
					loadOptions.mtlData = mtlBuffer;
				}
				const handle = await photonicScene.loadModel(loadOptions);
				referenceHandle = handle;
				referenceName = name;
				referenceInfo = typeof handle.getModelInfo === 'function' ? handle.getModelInfo() : null;
				placeReferenceModel();
				hideError();
				const materialNote = hand.mtlName
					? ' (materials: ' + hand.mtlName + ')'
					: (hand.missingMaterial ? ' (without materials - ' + hand.missingMaterial + ' not found)' : '');
				statusElement.textContent = 'Status: Reference model loaded: ' + name + materialNote;
				vscode.postMessage({
					type: 'referenceModelLoaded',
					name,
					format: referenceInfo ? referenceInfo.format : 'unknown',
					meshCount: referenceInfo ? referenceInfo.meshCount : 0,
					materialFile: hand.mtlName || null,
					materialsMissing: mtlBuffer ? null : (hand.missingMaterial || null)
				});
			} catch (error) {
				console.error('Failed to load reference model:', error);
				const message = 'Could not load reference model "' + name + '": ' + (error?.message || error);
				showError(message);
				vscode.postMessage({ type: 'referenceModelError', name, message });
			}
		}

		// Put the reference on the stage the way the designed part is put
		// there: centered across, resting on the floor. It takes the designed
		// model's stage scale when one is on stage, so the two keep their true
		// sizes relative to each other; on its own it gets the stage
		// normalization. Position is measured from a cleared origin, so the
		// call is safe to repeat when the design's scale changes.
		function placeReferenceModel() {
			if (!referenceHandle) {
				return;
			}
			const root = referenceHandle.getMesh();
			root.position.set(0, 0, 0);
			root.updateMatrixWorld(true);
			const rawBox = new THREE.Box3().setFromObject(root);
			const rawSize = rawBox.getSize(new THREE.Vector3());
			const currentScale = root.scale.x || 1;
			const maxDim = (Math.max(rawSize.x, rawSize.y, rawSize.z) / currentScale) || 1;
			const scale = currentDesignScale !== null ? currentDesignScale : LOOK.stageSize / maxDim;
			referenceHandle.setScale(scale, scale, scale);
			root.updateMatrixWorld(true);
			const box = new THREE.Box3().setFromObject(root);
			const center = box.getCenter(new THREE.Vector3());
			referenceHandle.setPosition(-center.x, -box.min.y, -center.z);
		}

		function clearReferenceModel() {
			if (referenceHandle && photonicScene) {
				photonicScene.removeObject(referenceHandle);
			}
			referenceHandle = null;
			referenceInfo = null;
			referenceName = null;
		}

		function renderGeometries(geometries) {
			// JSCAD is Z-up and Photonic is Y-up: every mesh goes into one group
			// turned -90 degrees about X, adopted whole through Photonic's public
			// addMesh call so the bake, clearing, and handles all see the model.
			const group = new THREE.Group();
			group.rotation.x = -Math.PI / 2;

			for (const geom of geometries) {
				try {
					if (geom.type === 'geom3') {
						const geometry = convertGeom3ToBufferGeometry(geom, THREE);
						const { colorHex, opacity } = getColorHexAndOpacity(geom, 0xb0b8c0);
						const materialOptions = {
							color: colorHex,
							metalness: MATERIAL_PRESET.metalness,
							roughness: MATERIAL_PRESET.roughness,
							side: THREE.DoubleSide
						};
						if (opacity < 1) {
							materialOptions.transparent = true;
							materialOptions.opacity = opacity;
							materialOptions.depthWrite = false;
						}
						const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial(materialOptions));

						if (geom.transforms && Array.isArray(geom.transforms) && geom.transforms.length === 16) {
							const matrix = new THREE.Matrix4();
							matrix.fromArray(geom.transforms);
							matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
						}

						group.add(mesh);
					} else if (geom.type === 'geom2') {
						const geometry = convertGeom2ToLineGeometry(geom, THREE);
						const { colorHex, opacity } = getColorHexAndOpacity(geom, 0x2266cc);
						const lineOptions = { color: colorHex, linewidth: 2 };
						if (opacity < 1) {
							lineOptions.transparent = true;
							lineOptions.opacity = opacity;
						}
						const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial(lineOptions));

						if (geom.transforms && Array.isArray(geom.transforms) && geom.transforms.length === 16) {
							const matrix = new THREE.Matrix4();
							matrix.fromArray(geom.transforms);
							matrix.decompose(line.position, line.quaternion, line.scale);
						}

						group.add(line);
					}
				} catch (error) {
					console.error('Error converting geometry:', error);
				}
			}

			// The clear below removes every registered object, the reference
			// model included. Its root survives (it was adopted with
			// disposeOnRemove off), so keep it and re-adopt it once the design
			// is back; it rejoins after the bake, leaving the design's baked
			// shading exactly as it was without a reference.
			const referenceRoot = referenceHandle ? referenceHandle.getMesh() : null;
			const restoreReference = () => {
				if (referenceRoot) {
					referenceHandle = photonicScene.addMesh(referenceRoot, {
						name: 'Reference: ' + referenceName,
						disposeOnRemove: false
					});
					placeReferenceModel();
				}
			};

			photonicScene.clearObjects();

			if (group.children.length === 0) {
				currentBounds = null;
				currentDesignScale = null;
				restoreReference();
				statusElement.textContent = 'Status: Rendered ' + geometries.length + ' object(s)';
				return;
			}

			// Presentation copy only: center the model on the stage, rest it on
			// the floor, and scale it to a fixed size across so Photonic's grid,
			// light, and shadow tuning (room scale) apply as designed. The model's
			// own coordinates, parameters, and exports are untouched.
			group.updateMatrixWorld(true);
			const rawBox = new THREE.Box3().setFromObject(group);
			const rawSize = rawBox.getSize(new THREE.Vector3());
			const rawCenter = rawBox.getCenter(new THREE.Vector3());
			const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1;
			const scale = LOOK.stageSize / maxDim;
			currentDesignScale = scale;
			group.scale.setScalar(scale);
			group.position.set(-rawCenter.x * scale, -rawBox.min.y * scale, -rawCenter.z * scale);

			photonicScene.addMesh(group);

			const size = rawSize.clone().multiplyScalar(scale);
			currentBounds = { center: new THREE.Vector3(0, size.y / 2, 0), size };

			// Baked contact shading over the adopted geometry (Photonic F11).
			try {
				photonicScene.bakeAmbientOcclusion();
			} catch (error) {
				console.error('Baked ambient occlusion failed:', error);
			}

			restoreReference();

			statusElement.textContent = 'Status: Rendered ' + geometries.length + ' object(s)';

			if (!hasRenderedOnce && !userHasInteracted) {
				fitCameraToObjects();
				hasRenderedOnce = true;
			}
		}

		function captureSnapshot() {
			if (!photonicScene) {
				return;
			}
			const renderer = photonicScene.renderer.renderer;
			renderer.render(photonicScene.scene, photonicScene.camera.camera);
			const dataUrl = renderer.domElement.toDataURL('image/png');
			vscode.postMessage({ type: 'saveSnapshot', dataUrl });
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
		document.getElementById('parameter-header')?.addEventListener('click', () => {
			parameterContent.classList.toggle('collapsed');
			collapseButton.textContent = parameterContent.classList.contains('collapsed') ? '▶' : '▼';
		});

		snapshotButton?.addEventListener('click', captureSnapshot);

		clearReferenceButton?.addEventListener('click', () => {
			clearReferenceModel();
			hideError();
			statusElement.textContent = 'Status: Ready';
			vscode.postMessage({ type: 'referenceModelCleared' });
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
				case 'loadReferenceModel':
					void loadReferenceModel(message.name, message.data, message);
					break;
				case 'clearReferenceModel':
					clearReferenceModel();
					hideError();
					statusElement.textContent = 'Status: Ready';
					vscode.postMessage({ type: 'referenceModelCleared' });
					break;
				case 'error':
					showError(message.message);
					break;
				case 'resetView':
					hasRenderedOnce = false;
					userHasInteracted = false;
					break;
			}
		});

		initThreeJS();
		vscode.postMessage({ type: 'ready' });
	})().catch(showBootError);
})();
