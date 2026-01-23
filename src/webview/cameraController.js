/**
 * Camera controller for the 3D viewer
 * Manages camera state and position updates for orbit controls
 * 
 * Note: Works with plain {x, y, z} objects for target to avoid THREE.js dependency
 * The camera.lookAt() method accepts both Vector3 and plain objects with x, y, z
 */

export class CameraController {
	constructor(camera, options = {}) {
		this.camera = camera;
		this.target = options.target || { x: 0, y: 0, z: 0 };
		this.rotation = options.rotation || { theta: Math.PI / 4, phi: Math.PI / 4 };
		this.distance = options.distance || 50;
		this.minDistance = options.minDistance || 5;
		this.maxDistance = options.maxDistance || 200;
	}

	/**
	 * Update camera position based on current rotation and distance
	 */
	updatePosition() {
		const sinPhi = Math.sin(this.rotation.phi);
		// Z-up camera orbit (JSCAD-style). theta rotates in XY, phi is polar angle from +Z.
		this.camera.position.x = this.target.x + this.distance * sinPhi * Math.cos(this.rotation.theta);
		this.camera.position.y = this.target.y + this.distance * sinPhi * Math.sin(this.rotation.theta);
		this.camera.position.z = this.target.z + this.distance * Math.cos(this.rotation.phi);
		// THREE.js lookAt accepts objects with x, y, z properties
		this.camera.lookAt(this.target.x, this.target.y, this.target.z);
		this.camera.updateMatrixWorld();
	}

	/**
	 * Sync controller state from current camera position
	 */
	syncFromCamera() {
		const offset = {
			x: this.camera.position.x - this.target.x,
			y: this.camera.position.y - this.target.y,
			z: this.camera.position.z - this.target.z
		};
		
		this.distance = Math.sqrt(offset.x * offset.x + offset.y * offset.y + offset.z * offset.z);
		
		if (this.distance < 1e-6) {
			return;
		}
		
		this.rotation.theta = Math.atan2(offset.y, offset.x);
		const cosPhi = offset.z / this.distance;
		this.rotation.phi = Math.acos(Math.max(-1, Math.min(1, cosPhi)));
	}

	/**
	 * Rotate the camera by the given deltas
	 * @param {number} deltaTheta - Horizontal rotation delta (radians)
	 * @param {number} deltaPhi - Vertical rotation delta (radians)
	 */
	rotate(deltaTheta, deltaPhi) {
		this.rotation.theta += deltaTheta;
		this.rotation.phi -= deltaPhi;
		this.rotation.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.rotation.phi));
		this.updatePosition();
	}

	/**
	 * Zoom the camera by applying a zoom factor
	 * @param {number} factor - Zoom factor (>1 zooms out, <1 zooms in)
	 */
	zoom(factor) {
		this.distance *= factor;
		this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
		this.updatePosition();
	}

	/**
	 * Fit camera to view a bounding box
	 * @param {Object} bounds - Object with center and size
	 */
	fitToView(bounds) {
		const { center, size } = bounds;
		
		const maxDim = Math.max(size.x, size.y, size.z);
		const minSize = 10;
		const effectiveSize = Math.max(maxDim, minSize);
		
		const fov = this.camera.fov * (Math.PI / 180);
		const distance = effectiveSize / (2 * Math.tan(fov / 2));
		const paddedDistance = distance * 1.5;
		
		this.target = { ...center };
		this.distance = paddedDistance;
		this.minDistance = Math.max(0.1, paddedDistance * 0.02);
		this.maxDistance = Math.max(this.minDistance * 2, paddedDistance * 20);
		this.rotation.theta = Math.PI / 4;
		this.rotation.phi = Math.PI / 4;
		this.updatePosition();
		
		// Update camera frustum
		const far = Math.max(1000, paddedDistance * 100);
		const near = Math.max(0.01, far / 100000);
		this.camera.near = near;
		this.camera.far = far;
		this.camera.updateProjectionMatrix();
	}

	/**
	 * Get current camera state
	 */
	getState() {
		return {
			target: { ...this.target },
			rotation: { ...this.rotation },
			distance: this.distance,
			minDistance: this.minDistance,
			maxDistance: this.maxDistance
		};
	}

	/**
	 * Set camera state
	 */
	setState(state) {
		if (state.target) {
			this.target = { ...state.target };
		}
		if (state.rotation) {
			this.rotation = { ...state.rotation };
		}
		if (state.distance !== undefined) {
			this.distance = state.distance;
		}
		if (state.minDistance !== undefined) {
			this.minDistance = state.minDistance;
		}
		if (state.maxDistance !== undefined) {
			this.maxDistance = state.maxDistance;
		}
		this.updatePosition();
	}
}
