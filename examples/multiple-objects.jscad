const { cube, sphere, cylinder } = require('@jscad/modeling').primitives
const { translate } = require('@jscad/modeling').transforms

const main = () => {
  // Create multiple objects at different positions
  const cube1 = translate([-20, 0, 0], cube({ size: 10 }))
  const sphere1 = translate([20, 0, 0], sphere({ radius: 5 }))
  const cylinder1 = translate([0, 20, 0], cylinder({ radius: 3, height: 15 }))
  const cube2 = translate([0, -20, 0], cube({ size: 8 }))
  
  // Return all objects as an array
  return [cube1, sphere1, cylinder1, cube2]
}

module.exports = { main }
