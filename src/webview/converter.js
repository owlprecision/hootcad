/**
 * JSCAD to Three.js converter module for webview
 * This is the client-side version that runs in the browser
 */

/**
 * Triangulates a convex polygon using fan triangulation
 */
export function triangulatePolygon(vertices) {
	if (vertices.length < 3) {
		return [];
	}
	const triangles = [];
	for (let i = 1; i < vertices.length - 1; i++) {
		triangles.push([0, i, i + 1]);
	}
	return triangles;
}

/**
 * Converts a JSCAD geom3 (3D solid) to Three.js BufferGeometry
 */
export function convertGeom3ToBufferGeometry(geom3, THREE) {
	const positions = [];
	const normals = [];
	
	for (const polygon of geom3.polygons) {
		const vertices = polygon.vertices;
		if (vertices.length < 3) {
			continue;
		}
		
		// Compute face normal
		const v0 = vertices[0];
		const v1 = vertices[1];
		const v2 = vertices[2];
		
		const edge1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
		const edge2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
		
		const normal = [
			edge1[1] * edge2[2] - edge1[2] * edge2[1],
			edge1[2] * edge2[0] - edge1[0] * edge2[2],
			edge1[0] * edge2[1] - edge1[1] * edge2[0]
		];
		
		const length = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
		if (length > 0) {
			normal[0] /= length;
			normal[1] /= length;
			normal[2] /= length;
		}
		
		const triangles = triangulatePolygon(vertices);
		
		for (const triangle of triangles) {
			for (const vertexIndex of triangle) {
				const vertex = vertices[vertexIndex];
				positions.push(vertex[0], vertex[1], vertex[2]);
				normals.push(normal[0], normal[1], normal[2]);
			}
		}
	}
	
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
	return geometry;
}

/**
 * Converts a JSCAD geom2 (2D path) to Three.js line geometry
 */
export function convertGeom2ToLineGeometry(geom2, THREE) {
	const positions = [];
	for (const side of geom2.sides) {
		if (side.length === 2) {
			positions.push(side[0][0], side[0][1], 0);
			positions.push(side[1][0], side[1][1], 0);
		}
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	return geometry;
}
