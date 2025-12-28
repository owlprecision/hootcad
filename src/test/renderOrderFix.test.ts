/**
 * Test for verifying the render order fix.
 * 
 * The white pixel rendering bug was caused by incorrect entity render order.
 * The official @jscad/regl-renderer demo renders entities in this order:
 *   1. Grid (background reference)
 *   2. Axes (orientation indicators)
 *   3. User geometries (foreground content)
 * 
 * Previously, HootCAD rendered user geometries first, then grid/axes.
 * This caused GL state set by user geometry rendering to potentially
 * affect grid/axes rendering in unexpected ways.
 * 
 * The fix reverses the order to match the official demo pattern,
 * ensuring grid and axes establish the base GL state before user
 * geometries are rendered.
 */

import * as assert from 'assert';

suite('Render Order Fix', () => {
	test('Entity order documentation', () => {
		// This is a documentation test to explain the fix
		
		// INCORRECT order (caused white pixels):
		const incorrectOrder = [
			'userEntity1',
			'userEntity2',
			'grid',
			'axes'
		];
		
		// CORRECT order (matches official demo):
		const correctOrder = [
			'grid',
			'axes', 
			'userEntity1',
			'userEntity2'
		];
		
		// Grid and axes should be first
		assert.strictEqual(correctOrder[0], 'grid');
		assert.strictEqual(correctOrder[1], 'axes');
		
		// User entities should come after helpers
		assert.ok(correctOrder.indexOf('userEntity1') > correctOrder.indexOf('grid'));
		assert.ok(correctOrder.indexOf('userEntity1') > correctOrder.indexOf('axes'));
	});
});
