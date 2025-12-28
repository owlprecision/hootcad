const { cube } = require('@jscad/modeling').primitives

// This file intentionally has no main() export
const createCube = () => cube({ size: 10 })

module.exports = { createCube }
