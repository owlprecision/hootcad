const { cube } = require('@jscad/modeling').primitives

const main = () => {
  // Intentional syntax error
  return cube({ size: 10 }
}

module.exports = { main }
