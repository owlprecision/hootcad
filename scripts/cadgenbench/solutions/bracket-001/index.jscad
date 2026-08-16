const { cuboid } = require('@jscad/modeling').primitives;
const { translate } = require('@jscad/modeling').transforms;

// Example solution authored with the help of HootCAD's cad_advice/cad_math
// MCP tools: a 50x30x10mm mounting bracket, centered above the origin.
function main() {
	const width = 50;
	const depth = 30;
	const height = 10;

	return translate([0, 0, height / 2], cuboid({ size: [width, depth, height] }));
}

module.exports = { main };
