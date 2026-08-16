/**
 * Validity checks and geometric metrics for the CADGenBench harness.
 *
 * These are proxies for CADGenBench's real CAD Score pipeline (which scores
 * STEP/BREP files against privately-held ground truth using surface-distance
 * F1, volume IoU, and topology/interface matching). Since HootCAD/JSCAD
 * produce tessellated meshes rather than BREP solids, this harness can only
 * approximate the "validity" gate and basic shape metrics locally. See the
 * README in this directory for details on scope and limitations.
 */

const modeling = require('@jscad/modeling');
const { measureVolume, measureBoundingBox, measureDimensions } = modeling.measurements;

function isGeom3(geom) {
	return !!geom && Array.isArray(geom.polygons);
}

/**
 * Checks whether a geom3 solid looks well-formed enough to be considered
 * "valid": it must have at least one polygon, every vertex must be finite,
 * and every polygon must have at least 3 vertices (non-degenerate).
 *
 * @param {any} geom A geom3 object.
 * @returns {{ valid: boolean, reasons: string[] }}
 */
function checkGeom3Validity(geom) {
	const reasons = [];

	if (!isGeom3(geom)) {
		return { valid: false, reasons: ['Not a 3D solid (geom3)'] };
	}

	if (geom.polygons.length === 0) {
		reasons.push('Geometry has no polygons (empty solid)');
	}

	for (const polygon of geom.polygons) {
		if (!Array.isArray(polygon.vertices) || polygon.vertices.length < 3) {
			reasons.push('Found a degenerate polygon with fewer than 3 vertices');
			break;
		}
	}

	const hasNonFiniteVertex = geom.polygons.some(polygon =>
		polygon.vertices.some(vertex => vertex.some(coord => !Number.isFinite(coord)))
	);
	if (hasNonFiniteVertex) {
		reasons.push('Geometry contains non-finite vertex coordinates (NaN/Infinity)');
	}

	let volume = 0;
	try {
		volume = measureVolume(geom);
	} catch (error) {
		reasons.push(`Failed to measure volume: ${error.message}`);
	}
	if (Number.isFinite(volume) && volume <= 0) {
		reasons.push('Solid has zero or negative volume (likely not watertight/closed)');
	}

	return { valid: reasons.length === 0, reasons };
}

/**
 * Computes the geometric metrics used to score a candidate against a
 * sample's requirements: bounding box dimensions and volume.
 *
 * @param {any} geom A geom3 object.
 * @returns {{ dimensions: [number, number, number], boundingBox: [[number,number,number],[number,number,number]], volume: number }}
 */
function computeMetrics(geom) {
	const boundingBox = measureBoundingBox(geom);
	const dimensions = measureDimensions(geom);
	let volume = 0;
	try {
		volume = measureVolume(geom);
	} catch (error) {
		volume = 0;
	}
	return { dimensions, boundingBox, volume };
}

/**
 * Scores computed metrics against a sample's declared requirements.
 *
 * Supported requirement shapes (all optional):
 * - `boundingBox: { x, y, z, tolerance }` - expected dimensions (in JSCAD units) with an allowed +/- tolerance.
 * - `volume: { min, max }` - expected volume range.
 * - `mustBeWatertight: boolean` - whether the solid must pass the validity gate.
 *
 * @param {object} requirements
 * @param {{ dimensions: number[], volume: number }} metrics
 * @param {boolean} isValid Result of the validity gate.
 * @returns {{ score: number, checks: Array<{ name: string, passed: boolean, detail: string }> }}
 */
function scoreRequirements(requirements, metrics, isValid) {
	const checks = [];
	const reqs = requirements || {};

	if (reqs.mustBeWatertight) {
		checks.push({
			name: 'watertight',
			passed: isValid,
			detail: isValid ? 'Solid passed the validity gate' : 'Solid failed the validity gate'
		});
	}

	if (reqs.boundingBox) {
		const { x, y, z, tolerance = 0 } = reqs.boundingBox;
		const [dx, dy, dz] = metrics.dimensions;
		const withinTolerance = (expected, actual) => expected === undefined || Math.abs(expected - actual) <= tolerance;
		const passed = withinTolerance(x, dx) && withinTolerance(y, dy) && withinTolerance(z, dz);
		checks.push({
			name: 'boundingBox',
			passed,
			detail: `expected ~[${x}, ${y}, ${z}] (+/-${tolerance}), got [${dx.toFixed(3)}, ${dy.toFixed(3)}, ${dz.toFixed(3)}]`
		});
	}

	if (reqs.volume) {
		const { min, max } = reqs.volume;
		const passed = (min === undefined || metrics.volume >= min) && (max === undefined || metrics.volume <= max);
		checks.push({
			name: 'volume',
			passed,
			detail: `expected [${min ?? '-inf'}, ${max ?? '+inf'}], got ${metrics.volume.toFixed(3)}`
		});
	}

	const score = checks.length === 0 ? (isValid ? 1 : 0) : checks.filter(c => c.passed).length / checks.length;
	return { score, checks };
}

module.exports = {
	isGeom3,
	checkGeom3Validity,
	computeMetrics,
	scoreRequirements
};
