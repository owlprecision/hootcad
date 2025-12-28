const { circle, square } = require('@jscad/modeling').primitives

const main = () => [
  circle({ radius: 5 }),
  square({ size: 10 })
]

module.exports = { main }
