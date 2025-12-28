const { cube } = require('@jscad/modeling').primitives

// Simple index.jscad file for testing workspace entrypoint resolution
const main = () => cube({ size: 15 })

module.exports = { main }
