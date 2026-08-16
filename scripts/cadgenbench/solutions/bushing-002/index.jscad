const { cylinder } = require('@jscad/modeling').primitives;
const { translate } = require('@jscad/modeling').transforms;

// Example solution: a 20mm diameter, 15mm tall cylindrical bushing.
function main() {
	const radius = 10;
	const height = 15;

	return translate([0, 0, height / 2], cylinder({ radius, height, segments: 64 }));
}

module.exports = { main };
