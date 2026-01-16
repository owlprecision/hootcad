# General CAD Advice

**ALWAYS use the cad_math tool to verify all mathematical calculations** instead of depending on your own mental math. This is critical for ensuring accuracy in CAD dimensions and transformations, even if you think it's only a simple project, or the calculations are obvious.

**Available advice categories**: general, dfm, jscad-specific

## Breaking Down User Queries into JSCAD Primitives

When planning JSCAD code, decompose the user's requirements into basic primitives:

1. **Start with basic shapes**: cube, sphere, cylinder, cuboid, cylinderElliptic, roundedCuboid, roundedCylinder, geodesicSphere, torus
2. **Combine with boolean operations**: union, subtract, intersect
3. **Apply transformations**: translate, rotate, scale, mirror, center, align
4. **Use hulls for organic shapes**: hull, hullChain
5. **Extrude 2D paths**: extrudeLinear, extrudeRotate, extrudeFromSlices

## Spatial Awareness and Coordinate Systems

- JSCAD uses a **right-handed coordinate system**: X (right), Y (forward/up in 2D), Z (up in 3D)
- **Origin (0,0,0)** is the default center for primitives unless offset
- When combining shapes, track their centers and offsets carefully
- Use `center()` or `align()` to reposition shapes predictably
- **Angles are in radians**, not degrees. Use PI for conversions: `degrees * (Math.PI / 180)`

## Assembly/Connectivity Validation (Do This Every Time)

When a model is made of multiple parts (towers + domes + minarets + base + arches), the most common failure is **parts that visually look close but are not actually connected** (floating gaps or accidental separations). Prevent this by enforcing a numeric validation loop.

Before you write `translate([...])` or hardcode an offset:

1. Identify the two mating surfaces (or centers): e.g. “top of base” and “bottom of dome”, or “peg” and “socket”.
2. Write down the dimensions that determine contact (heights, radii, wall thickness, clearance).
3. Call `cad_math` to compute:
	- **gap** between surfaces (want $\approx 0$ or slightly negative for overlap)
	- **clearance** where needed (want $> 0$ with a tolerance)
	- **alignment** (centers, symmetry, spacing)
4. Only then set the `translate`/`rotate` constants in code using those computed values.

Concrete patterns to validate with the math tool:
- Surface contact in Z-up: `gapZ = (baseTopZ) - (domeBottomZ)` → want `gapZ ≈ 0`
- Socket/peg radial fit: `gapR = (socketRadius - clearance) - pegRadius` → want `gapR >= 0`
- Stacking offset: `domeCenterZ = baseTopZ + domeHeight/2` (validate)
- Symmetry spacing: `spacing = (totalWidth - 2*margin) / (n-1)` (validate)

Use a small tolerance for “connected” vs “gap” (example: `epsilon = 0.05` to `0.2` mm depending on scale).

## Dimensional Planning

- Define dimensions as named constants at the top of your code for clarity
- Use the cad_math tool to compute derived dimensions (clearances, offsets, diagonal distances)
- Consider tolerances and clearances for assemblies (typically 0.1-0.5mm for 3D printing)
- Verify all dimensions and calculations with cad_math before finalizing geometry

## Common JSCAD Patterns

- **Walls/Shells**: Use subtract to remove a smaller interior shape from a larger exterior
- **Holes**: Use subtract with cylinders or other shapes positioned at hole locations
- **Patterns**: Use array methods (map, forEach) to create repeated features
- **Chamfers/Fillets**: Use hull or offset operations for rounded edges
- **Complex curves**: Use Bezier curves, ellipses, or arc functions from @jscad/modeling/curves

## Error Prevention

- Always verify that transformations are applied in the correct order (order matters!)
- Check that union/subtract/intersect operations have compatible geometry types
- Ensure all primitives have positive dimensions
- Validate that angles are in radians when required
- Use descriptive variable names to track which dimensions are which
