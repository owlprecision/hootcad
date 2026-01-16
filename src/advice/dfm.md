# Design for Manufacturing (DFM) and 3D Printability Advice

## 3D Printing Constraints

**Minimum feature sizes**:
- Wall thickness: minimum 0.8-1.0mm (2-3 nozzle widths for 0.4mm nozzle)
- Hole diameter: minimum 0.5mm (consider using clearance hole charts)
- Gap/slot width: minimum 0.5mm
- Text/embossing: minimum 0.6mm line width, 2mm height for legibility

**Overhangs and support**:
- Angles < 45° from vertical typically need support material
- Design self-supporting features when possible (chamfers, gradual transitions)
- Bridge distances should be < 5mm for reliable printing without supports
- Use tear-drop shaped holes for vertical holes to avoid support inside holes

**Layer adhesion and strength**:
- Orient parts to align stress directions with layer lines when possible
- Avoid thin vertical features that may break during printing
- Design with layer height in mind (common: 0.1-0.3mm)
- Add chamfers or fillets to reduce stress concentrations

## Tolerance and Clearances

**Press fits and assemblies**:
- Tight fit: -0.1 to 0.0mm clearance (may require force)
- Sliding fit: 0.1-0.2mm clearance
- Loose fit: 0.3-0.5mm clearance
- Threaded inserts: design holes 0.2-0.5mm smaller than insert OD

**Dimensional accuracy**:
- Expect ±0.1-0.2mm tolerance on well-calibrated FDM printers
- Holes typically print slightly smaller than modeled (0.1-0.3mm)
- External dimensions typically print close to modeled size
- Test fit critical dimensions with a calibration print first

## Printability Best Practices

**Avoid print failures**:
- No completely unsupported horizontal surfaces in mid-air
- Minimize/eliminate overhangs where possible
- Design with bed adhesion in mind (add chamfers/bevels at base)
- Avoid tiny islands that may not adhere well

**Assembly considerations**:
- Design snap-fits with 0.2-0.4mm clearance for flexibility
- Add alignment pins or keys for multi-part assemblies
- Consider print orientation to minimize support and maximize strength
- Design screw bosses with sufficient wall thickness (2-3x screw diameter)

**Material-specific considerations**:
- PLA: rigid, brittle, good for prototypes and static parts
- PETG: flexible, durable, good for functional parts
- ABS: strong, heat-resistant, requires heated enclosure
- TPU: flexible, consider infill density for desired flexibility

## Design Verification Checklist

Before finalizing your design:
- [ ] All wall thicknesses ≥ 0.8mm
- [ ] All overhangs ≤ 45° or designed with support in mind
- [ ] Clearances appropriate for intended fit type
- [ ] Hole diameters account for printer tolerance
- [ ] Part orientation optimized for strength and minimal support
- [ ] Critical dimensions verified with cad_math tool
- [ ] Features larger than minimum printable size
