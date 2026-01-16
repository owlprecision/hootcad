# JSCAD-Specific Guidance

## Module System and Imports

JSCAD uses **CommonJS** (not ES modules):
```javascript
// Correct
const { cube, sphere } = require('@jscad/modeling').primitives
const { union, subtract } = require('@jscad/modeling').booleans

// Wrong - don't use ES6 imports
import { cube } from '@jscad/modeling/primitives' // Will not work
```

## Key JSCAD Packages

**Core modeling**: `@jscad/modeling`
- `primitives` - cube, sphere, cylinder, cuboid, etc.
- `booleans` - union, subtract, intersect
- `transforms` - translate, rotate, scale, mirror, center, align
- `hulls` - hull, hullChain
- `extrusions` - extrudeLinear, extrudeRotate, extrudeFromSlices
- `expansions` - expand, offset
- `colors` - colorize, colorNameToRgb

**2D operations**: `@jscad/modeling/geometries/path2`
- `arc`, `circle`, `ellipse`, `rectangle`, `roundedRectangle`, `square`, `star`, `triangle`

**Text**: `@jscad/modeling/text`
- `vectorText()` - generates 2D paths for text that can be extruded

## Main Function and Return Types

The **main()** function is the entry point:
```javascript
const main = () => {
  return cube({ size: 10 })
}

module.exports = { main }
```

**Valid return types**:
- Single geometry: `geom3`, `geom2`, `path2`
- Array of geometries: `[geom3, geom3, ...]`
- Object for multiple outputs: `{ part1: geom3, part2: geom3 }`

## Parameters and Interactive Design

Use `getParameterDefinitions()` for interactive parameters:
```javascript
const getParameterDefinitions = () => [
  { name: 'width', type: 'number', initial: 10, caption: 'Width (mm)' },
  { name: 'height', type: 'number', initial: 20, caption: 'Height (mm)' },
  { name: 'shape', type: 'choice', caption: 'Shape', values: ['cube', 'sphere'], initial: 'cube' }
]

const main = (params) => {
  const { width, height, shape } = params
  // Use params to create geometry
}

module.exports = { main, getParameterDefinitions }
```

## Coordinate System and Rotations

- **Coordinate system**: Right-handed, Z-up
- **Rotation**: around axis, in radians, counterclockwise when looking from positive axis toward origin
- **Rotation order matters**: `rotate([angleX, angleY, angleZ])` applies Z, then Y, then X

```javascript
// Rotate 90° around Z axis
rotate([0, 0, Math.PI / 2], cube())

// Tilt forward 45° (rotate around X axis)
rotate([Math.PI / 4, 0, 0], cube())
```

## Common JSCAD Gotchas

**1. Transform order matters**:
```javascript
// These are NOT the same:
translate([10, 0, 0], rotate([0, 0, Math.PI/2], cube()))  // Rotate then move
rotate([0, 0, Math.PI/2], translate([10, 0, 0], cube()))  // Move then rotate
```

**2. Boolean operations require same geometry type**:
```javascript
// Wrong - can't union 2D and 3D
union(circle({ radius: 5 }), cube({ size: 10 }))

// Correct - extrude 2D to 3D first
union(extrudeLinear({ height: 2 }, circle({ radius: 5 })), cube({ size: 10 }))
```

**3. Primitives are centered by default**:
```javascript
cube({ size: 10 })  // Center at origin
cube({ size: 10, center: [0, 0, 0] })  // Same as above
cube({ size: 10, center: [5, 5, 5] })  // Different center point
```

**4. Colors are cosmetic only** (for visualization, not STL export):
```javascript
colorize([1, 0, 0], cube())  // Red cube in preview
```

## Performance Tips

- Avoid excessive boolean operations on high-polygon meshes
- Use `sphere({ segments: 16 })` instead of default for faster rendering (default is higher)
- Consider using `cylinderElliptic` with fewer segments for performance
- Combine multiple `union()` calls into a single call with array: `union([shape1, shape2, shape3])`

## Debugging JSCAD Code

- Use `console.log()` to output values (visible in HootCAD output channel)
- Check geometry types with `geom3.isA()`, `geom2.isA()`, `path2.isA()`
- Verify dimensions with `measureBoundingBox()` from `@jscad/modeling/measurements`
- Use colorize to visually distinguish parts during development

## Additional Resources

- Official docs: https://openjscad.xyz/
- Modeling package docs: https://github.com/jscad/OpenJSCAD.org/tree/master/packages/modeling
- Examples: Check the HootCAD `examples/` directory
