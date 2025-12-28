const { cube, sphere } = require('@jscad/modeling').primitives

const main = () => [
  cube({ size: 10 }),
  sphere({ radius: 5 })
]

module.exports = { main }
