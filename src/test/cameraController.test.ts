import * as assert from 'assert';

// Mock THREE.Vector3 for testing
class MockVector3 {
	constructor(public x = 0, public y = 0, public z = 0) {}
}

// Mock camera for testing
class MockCamera {
	position = new MockVector3(30, 30, 30);
	fov = 45;
	near = 0.1;
	far = 1000;
	
	lookAt(target: any) {
		// Mock implementation
	}
	
	updateProjectionMatrix() {
		// Mock implementation
	}
	
	updateMatrixWorld() {
		// Mock implementation
	}
}

// Import the CameraController
// We need to handle the import carefully since it's a .js file
const cameraControllerPath = '../webview/cameraController.js';

suite('Camera Controller Test Suite', () => {
	let camera: MockCamera;
	let CameraController: any;

	suiteSetup(async () => {
		// Dynamically import the module
		const module = await import(cameraControllerPath);
		CameraController = module.CameraController;
	});

	setup(() => {
		camera = new MockCamera();
	});

	test('CameraController should initialize with default options', () => {
		const controller = new CameraController(camera);
		
		assert.ok(controller, 'Controller should be created');
		assert.strictEqual(controller.distance, 50, 'Default distance should be 50');
		assert.strictEqual(controller.minDistance, 5, 'Default min distance should be 5');
		assert.strictEqual(controller.maxDistance, 200, 'Default max distance should be 200');
	});

	test('CameraController should initialize with custom options', () => {
		const controller = new CameraController(camera, {
			target: { x: 10, y: 20, z: 30 },
			distance: 100,
			minDistance: 10,
			maxDistance: 500
		});
		
		assert.strictEqual(controller.target.x, 10, 'Target x should be 10');
		assert.strictEqual(controller.target.y, 20, 'Target y should be 20');
		assert.strictEqual(controller.target.z, 30, 'Target z should be 30');
		assert.strictEqual(controller.distance, 100, 'Distance should be 100');
		assert.strictEqual(controller.minDistance, 10, 'Min distance should be 10');
		assert.strictEqual(controller.maxDistance, 500, 'Max distance should be 500');
	});

	test('CameraController.rotate should update rotation', () => {
		const controller = new CameraController(camera);
		const initialTheta = controller.rotation.theta;
		const initialPhi = controller.rotation.phi;
		
		controller.rotate(0.1, 0.1);
		
		assert.notStrictEqual(controller.rotation.theta, initialTheta, 'Theta should change');
		assert.notStrictEqual(controller.rotation.phi, initialPhi, 'Phi should change');
	});

	test('CameraController.rotate should clamp phi angle', () => {
		const controller = new CameraController(camera);
		
		// Try to rotate phi beyond limits
		controller.rotate(0, -Math.PI * 2);
		assert.ok(controller.rotation.phi >= 0.1, 'Phi should be clamped to minimum');
		assert.ok(controller.rotation.phi <= Math.PI - 0.1, 'Phi should be clamped to maximum');
	});

	test('CameraController.zoom should update distance', () => {
		const controller = new CameraController(camera);
		const initialDistance = controller.distance;
		
		controller.zoom(1.5); // Zoom out
		assert.ok(controller.distance > initialDistance, 'Distance should increase when zooming out');
		
		controller.zoom(0.5); // Zoom in
		assert.ok(controller.distance < initialDistance, 'Distance should decrease when zooming in');
	});

	test('CameraController.zoom should respect min/max distance', () => {
		const controller = new CameraController(camera, {
			distance: 50,
			minDistance: 10,
			maxDistance: 100
		});
		
		// Try to zoom out beyond max
		controller.zoom(10);
		assert.strictEqual(controller.distance, 100, 'Distance should be clamped to max');
		
		// Try to zoom in beyond min
		controller.zoom(0.01);
		assert.strictEqual(controller.distance, 10, 'Distance should be clamped to min');
	});

	test('CameraController.fitToView should adjust camera for bounds', () => {
		const controller = new CameraController(camera);
		const bounds = {
			center: { x: 5, y: 10, z: 15 },
			size: { x: 20, y: 30, z: 25 }
		};
		
		controller.fitToView(bounds);
		
		assert.strictEqual(controller.target.x, 5, 'Target should match bounds center x');
		assert.strictEqual(controller.target.y, 10, 'Target should match bounds center y');
		assert.strictEqual(controller.target.z, 15, 'Target should match bounds center z');
		assert.ok(controller.distance > 0, 'Distance should be positive');
	});

	test('CameraController.getState should return current state', () => {
		const controller = new CameraController(camera, {
			target: { x: 1, y: 2, z: 3 },
			rotation: { theta: 1, phi: 1.5 },
			distance: 75
		});
		
		const state = controller.getState();
		
		assert.strictEqual(state.target.x, 1, 'State target x should match');
		assert.strictEqual(state.target.y, 2, 'State target y should match');
		assert.strictEqual(state.target.z, 3, 'State target z should match');
		assert.strictEqual(state.rotation.theta, 1, 'State theta should match');
		assert.strictEqual(state.rotation.phi, 1.5, 'State phi should match');
		assert.strictEqual(state.distance, 75, 'State distance should match');
	});

	test('CameraController.setState should update state', () => {
		const controller = new CameraController(camera);
		
		controller.setState({
			target: { x: 10, y: 20, z: 30 },
			rotation: { theta: 2, phi: 2.5 },
			distance: 150
		});
		
		assert.strictEqual(controller.target.x, 10, 'Target x should be updated');
		assert.strictEqual(controller.target.y, 20, 'Target y should be updated');
		assert.strictEqual(controller.target.z, 30, 'Target z should be updated');
		assert.strictEqual(controller.rotation.theta, 2, 'Theta should be updated');
		assert.strictEqual(controller.rotation.phi, 2.5, 'Phi should be updated');
		assert.strictEqual(controller.distance, 150, 'Distance should be updated');
	});

	test('CameraController.setState should handle partial state', () => {
		const controller = new CameraController(camera);
		const initialDistance = controller.distance;
		
		controller.setState({
			target: { x: 5, y: 5, z: 5 }
		});
		
		assert.strictEqual(controller.target.x, 5, 'Target should be updated');
		assert.strictEqual(controller.distance, initialDistance, 'Distance should remain unchanged');
	});
});
