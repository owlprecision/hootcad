const { cube, sphere, cylinder } = require('@jscad/modeling').primitives
const { translate } = require('@jscad/modeling').transforms

const getParameterDefinitions = () => {
  return [
    { name: 'shape', type: 'choice', caption: 'Shape', values: ['cube', 'sphere', 'cylinder'], captions: ['Cube', 'Sphere', 'Cylinder'], initial: 'cube' },
    { name: 'size', type: 'slider', initial: 10, min: 1, max: 30, step: 1, caption: 'Size' },
    { name: 'height', type: 'number', initial: 15, min: 1, max: 50, step: 1, caption: 'Height (for cylinder)' },
    { name: 'center', type: 'checkbox', checked: true, caption: 'Center at Origin' },
    { name: 'segments', type: 'int', initial: 32, min: 8, max: 64, step: 4, caption: 'Segments' }
  ]
}

const main = (params) => {
  const size = params.size || 10
  const height = params.height || 15
  const center = params.center !== undefined ? params.center : true
  const segments = params.segments || 32
  const shape = params.shape || 'cube'

  let geometry
  if (shape === 'sphere') {
    geometry = sphere({ radius: size / 2, segments })
  } else if (shape === 'cylinder') {
    geometry = cylinder({ radius: size / 2, height, segments })
  } else {
    geometry = cube({ size, center })
  }

  // If not centered, translate to show it's working
  if (!center && shape === 'cube') {
    geometry = translate([0, 0, size / 2], geometry)
  }

  return geometry
}

module.exports = { main, getParameterDefinitions }
