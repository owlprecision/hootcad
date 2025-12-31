/* global acquireVsCodeApi */

(function () {
	function getConfig() {
		const meta = document.querySelector('meta[name="hootcad-config"]');
		if (!meta) {
			throw new Error('Missing hootcad-config meta tag');
		}
		const raw = meta.getAttribute('content') || '';
		if (!raw) {
			throw new Error('Empty hootcad-config meta tag');
		}
		return JSON.parse(decodeURIComponent(raw));
	}

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

		const config = getConfig();
		const THREE = await import(config.threeUri);
		const { convertGeom3ToBufferGeometry, convertGeom2ToLineGeometry } = await import(config.converterUri);
		const { updateParameterUI } = await import(config.parameterUIUri);

		const canvas = document.getElementById('renderCanvas');
		const statusElement = document.getElementById('status');
		const loadingElement = document.getElementById('loading');
		const errorElement = document.getElementById('error-message');
		const parameterPanel = document.getElementById('parameter-panel');
		const parameterContent = document.getElementById('parameter-content');
		const collapseButton = document.getElementById('collapse-button');

		if (!canvas) {
			throw new Error('Missing #renderCanvas');
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

		// Brighter, JSCAD-like CAD preview lighting + color management.
		// These are the knobs to tweak if you want to tune the overall look.
		const LIGHTING_PRESET = {
			ambientIntensity: 0.35,
			hemiIntensity: 1.0,
			keyIntensity: 1.7,
			fillIntensity: 0.65,
			rimIntensity: 0.4,
			exposure: 1.05,
			toneMapping: THREE.ACESFilmicToneMapping
		};

		const SHADOW_PRESET = {
			enabled: true,
			// 0 = no visible shadow, 1 = full-strength shadow
			intensity: 0.35,
			// VSM produces much softer, less defined edges than PCF.
			type: 'VSM',
			mapSize: 2048,
			// Used by PCF; ignored by VSM.
			radius: 14,
			// Used by VSM; ignored by PCF.
			blurSamples: 32,
			bias: -0.00006,
			normalBias: 0.01,
			// Default extent; we tighten this dynamically per model for better shadow quality.
			cameraExtent: 120,
			cameraNear: 0.5,
			cameraFar: 250
		};

		const MATERIAL_PRESET = {
			// Lower metalness keeps saturated plastics from looking “sooty” without an environment map.
			metalness: 0.15,
			roughness: 0.35
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

		// Three.js scene setup
		let scene;
		let camera;
		let renderer;
		let meshGroup;
		let keyLight;
		let animationFrameId = null;
		let hasRenderedOnce = false; // Track if we've done initial render with auto-zoom
		let userHasInteracted = false; // Track if user has moved camera

		// Manual orbit-control state (shared by auto-fit + user input)
		const cameraTarget = new THREE.Vector3(0, 0, 0);
		const cameraRotation = { theta: Math.PI / 4, phi: Math.PI / 4 };
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
			if (cameraDistance < 1e-6) {
				return;
			}
			cameraRotation.theta = Math.atan2(offset.z, offset.x);
			const cosPhi = offset.y / cameraDistance;
			cameraRotation.phi = Math.acos(Math.max(-1, Math.min(1, cosPhi)));
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
				if (!isDragging) {
					return;
				}

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
			}, { passive: false });
		}

		function onWindowResize() {
			const container = document.getElementById('canvas-container');
			if (!container) {
				return;
			}
			const width = container.clientWidth;
			const height = container.clientHeight;

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
				if (child.geometry) {
					child.geometry.dispose();
				}
				if (child.material) {
					child.material.dispose();
				}
			}
		}

		function fitCameraToObjects() {
			const box = new THREE.Box3();

			if (meshGroup.children.length === 0) {
				return;
			}

			// Ensure world matrices are up-to-date before computing bounds
			meshGroup.updateMatrixWorld(true);

			meshGroup.children.forEach((child) => {
				const childBox = new THREE.Box3().setFromObject(child);
				box.union(childBox);
			});

			const center = new THREE.Vector3();
			const size = new THREE.Vector3();
			box.getCenter(center);
			box.getSize(size);

			const maxDim = Math.max(size.x, size.y, size.z);
			const minSize = 10;
			const effectiveSize = Math.max(maxDim, minSize);

			const fov = camera.fov * (Math.PI / 180);
			const distance = effectiveSize / (2 * Math.tan(fov / 2));
			const paddedDistance = distance * 1.5;

			cameraTarget.copy(center);
			cameraDistance = paddedDistance;
			cameraRotation.theta = Math.PI / 4;
			cameraRotation.phi = Math.PI / 4;
			updateCameraPosition();

			// Keep the key light aimed at the model center and tighten the shadow frustum
			// so shadows are higher-res and less blocky.
			if (keyLight) {
				keyLight.target.position.copy(center);
				keyLight.target.updateMatrixWorld(true);

				if (SHADOW_PRESET.enabled && keyLight.castShadow) {
					const maxDim = Math.max(size.x, size.y, size.z);
					const extent = Math.max(15, Math.min(220, maxDim * 2.5));
					keyLight.shadow.camera.left = -extent;
					keyLight.shadow.camera.right = extent;
					keyLight.shadow.camera.top = extent;
					keyLight.shadow.camera.bottom = -extent;
					keyLight.shadow.camera.updateProjectionMatrix();
				}
			}
		}

		function renderGeometries(geometries) {
			clearScene();

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
						const material = new THREE.MeshStandardMaterial(materialOptions);
						const mesh = new THREE.Mesh(geometry, material);
						mesh.castShadow = SHADOW_PRESET.enabled;
						// Transparent meshes look terrible when they receive shadow maps (self-shadow acne).
						mesh.receiveShadow = SHADOW_PRESET.enabled && opacity >= 1;

						if (geom.transforms && Array.isArray(geom.transforms) && geom.transforms.length === 16) {
							const matrix = new THREE.Matrix4();
							matrix.fromArray(geom.transforms);
							matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
						}

						meshGroup.add(mesh);
					} else if (geom.type === 'geom2') {
						const geometry = convertGeom2ToLineGeometry(geom, THREE);
						const { colorHex, opacity } = getColorHexAndOpacity(geom, 0x2266cc);
						const lineOptions = { color: colorHex, linewidth: 2 };
						if (opacity < 1) {
							lineOptions.transparent = true;
							lineOptions.opacity = opacity;
						}
						const material = new THREE.LineBasicMaterial(lineOptions);
						const line = new THREE.LineSegments(geometry, material);
						line.castShadow = false;
						line.receiveShadow = false;

						if (geom.transforms && Array.isArray(geom.transforms) && geom.transforms.length === 16) {
							const matrix = new THREE.Matrix4();
							matrix.fromArray(geom.transforms);
							matrix.decompose(line.position, line.quaternion, line.scale);
						}

						meshGroup.add(line);
					}
				} catch (error) {
					console.error('Error converting geometry:', error);
				}
			}

			statusElement.textContent = 'Status: Rendered ' + geometries.length + ' object(s)';

			if (!hasRenderedOnce && !userHasInteracted) {
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

		function initThreeJS() {
			scene = new THREE.Scene();
			scene.background = new THREE.Color(0xf5f5f5);

			const aspect = canvas.clientWidth / canvas.clientHeight;
			camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
			camera.position.set(30, 30, 30);

			cameraTarget.set(0, 0, 0);
			camera.lookAt(cameraTarget);
			syncControlsFromCamera();

			renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
			renderer.setSize(canvas.clientWidth, canvas.clientHeight);
			renderer.setPixelRatio(window.devicePixelRatio);
			if ('useLegacyLights' in renderer) {
				renderer.useLegacyLights = false;
			}

			if (THREE.ColorManagement) {
				THREE.ColorManagement.enabled = true;
			}
			renderer.outputColorSpace = THREE.SRGBColorSpace;
			renderer.toneMapping = LIGHTING_PRESET.toneMapping;
			renderer.toneMappingExposure = LIGHTING_PRESET.exposure;

			renderer.shadowMap.enabled = SHADOW_PRESET.enabled;
			renderer.shadowMap.type =
				SHADOW_PRESET.type === 'VSM' ? THREE.VSMShadowMap : THREE.PCFSoftShadowMap;

			const ambientLight = new THREE.AmbientLight(0xffffff, LIGHTING_PRESET.ambientIntensity);
			scene.add(ambientLight);

			const hemiLight = new THREE.HemisphereLight(0xffffff, 0x9aa6b2, LIGHTING_PRESET.hemiIntensity);
			hemiLight.position.set(0, 1, 0);
			scene.add(hemiLight);

			keyLight = new THREE.DirectionalLight(0xffffff, LIGHTING_PRESET.keyIntensity);
			keyLight.position.set(30, 50, 25);
			keyLight.castShadow = SHADOW_PRESET.enabled;
			if (SHADOW_PRESET.enabled) {
				// Available in newer Three.js (r150+). Keep guarded for compatibility.
				if (keyLight.shadow && 'intensity' in keyLight.shadow) {
					keyLight.shadow.intensity = SHADOW_PRESET.intensity;
				}
				keyLight.shadow.mapSize.width = SHADOW_PRESET.mapSize;
				keyLight.shadow.mapSize.height = SHADOW_PRESET.mapSize;
				if (SHADOW_PRESET.type !== 'VSM') {
					keyLight.shadow.radius = SHADOW_PRESET.radius;
				} else {
					// VSM uses an internal blur pass; more samples = softer edge.
					keyLight.shadow.blurSamples = SHADOW_PRESET.blurSamples;
				}
				keyLight.shadow.bias = SHADOW_PRESET.bias;
				keyLight.shadow.normalBias = SHADOW_PRESET.normalBias;
				keyLight.shadow.camera.near = SHADOW_PRESET.cameraNear;
				keyLight.shadow.camera.far = SHADOW_PRESET.cameraFar;
				keyLight.shadow.camera.left = -SHADOW_PRESET.cameraExtent;
				keyLight.shadow.camera.right = SHADOW_PRESET.cameraExtent;
				keyLight.shadow.camera.top = SHADOW_PRESET.cameraExtent;
				keyLight.shadow.camera.bottom = -SHADOW_PRESET.cameraExtent;
			}
			scene.add(keyLight);
			// DirectionalLight shadows aim at its target.
			scene.add(keyLight.target);

			const fillLight = new THREE.DirectionalLight(0xffffff, LIGHTING_PRESET.fillIntensity);
			fillLight.position.set(-35, 25, 15);
			scene.add(fillLight);

			const rimLight = new THREE.DirectionalLight(0xffffff, LIGHTING_PRESET.rimIntensity);
			rimLight.position.set(0, 15, -45);
			scene.add(rimLight);

			const gridHelper = new THREE.GridHelper(400, 40, 0x8899aa, 0xc5d0dd);
			scene.add(gridHelper);

			const axesHelper = new THREE.AxesHelper(100);
			scene.add(axesHelper);

			meshGroup = new THREE.Group();
			scene.add(meshGroup);

			setupControls();

			const container = document.getElementById('canvas-container');
			if (container && typeof ResizeObserver !== 'undefined') {
				const resizeObserver = new ResizeObserver(() => {
					onWindowResize();
				});
				resizeObserver.observe(container);
			}

			animate();

			statusElement.textContent = 'Status: Ready';
			loadingElement.style.display = 'none';
		}

		// Parameter panel collapse
		document.getElementById('parameter-header')?.addEventListener('click', () => {
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
					hasRenderedOnce = false;
					userHasInteracted = false;
					break;
			}
		});

		initThreeJS();
		vscode.postMessage({ type: 'ready' });
	})().catch(showBootError);
})();
