# OpenGeometry Support Investigation

## Overview

This document investigates adding [OpenGeometry](https://github.com/OpenGeometry-io/OpenGeometry) support to HootCAD as a complementary or alternative geometry kernel alongside the existing JSCAD pipeline.

---

## What Is OpenGeometry?

OpenGeometry is an open-source CAD kernel built for the web. Its core is written in Rust and compiled to WebAssembly (WASM), exposing a TypeScript/JavaScript API designed to integrate with Three.js.

### Key capabilities

| Capability | Details |
|---|---|
| **2D/3D primitives** | Lines, arcs, polylines, rectangles, cuboids, spheres, cylinders, wedges |
| **Boolean operations** | Union, intersection, subtraction (kernel-backed, experimental) |
| **Extrusion & sweep** | Turn 2D profiles into 3D solids; sweep along arbitrary paths |
| **BREP access** | Boundary Representation data (solid/face/edge/vertex) |
| **Triangulation** | Robust polygon triangulation with hole support |
| **Offsetting** | Curve and surface offsets |
| **Export** | STL, STEP, IFC, PDF (some experimental) |
| **Three.js integration** | Native API compatibility with Three.js objects |
| **WASM runtime** | Near-native performance, fully client-side, no server required |

### Architecture

```
┌─────────────────────────────┐
│   Application / Rendering   │  (Three.js, custom webview)
├─────────────────────────────┤
│  TypeScript / JS API layer  │  (opengeometry npm package)
├─────────────────────────────┤
│   Rust Core (via WASM)      │  (geometry kernel, booleans, BREP)
└─────────────────────────────┘
```

---

## How HootCAD Currently Works

HootCAD is a VS Code/Cursor extension that:

1. **Executes** `.jscad` files in a Node.js VM context via `jscadEngine.ts`
2. **Serializes** JSCAD `geom3`/`geom2` geometry objects from the VM to plain JSON
3. **Posts** the serialized geometry to a VS Code webview via `postMessage`
4. **Renders** geometry in the webview using Three.js via `threeJsConverter.ts` / `renderer.js`

```
.jscad file  →  jscadEngine (Node VM)  →  serialize  →  postMessage  →  webview Three.js render
```

### Current geometry pipeline

- **JSCAD** (`@jscad/modeling`): JavaScript-only, runs in Node.js VM
- **Geometry format**: raw polygon/side arrays serialized to JSON
- **Conversion**: `threeJsConverter.ts` converts JSCAD polygons to Three.js `BufferGeometry`
- **Export**: JSCAD serializers (STL, OBJ, AMF, DXF, SVG, JSON, X3D)

---

## OpenGeometry vs JSCAD Comparison

| Feature | JSCAD (`@jscad/modeling`) | OpenGeometry |
|---|---|---|
| Runtime | JavaScript (Node.js + browser) | Rust → WASM (browser) |
| Performance | Good, limited by JS | Near-native via WASM |
| Boolean ops | Yes | Yes (kernel-backed, more robust) |
| BREP access | No | Yes |
| 3D primitives | Rich set | Rich set |
| 2D primitives | Yes | Yes |
| Parametric scripting | Yes (user writes JS/JSCAD) | No built-in scripting model |
| Three.js integration | Indirect (manual conversion) | Native API |
| STEP export | No | Yes (experimental) |
| IFC export | No | Yes (experimental) |
| STL export | Yes | Yes |
| File format | `.jscad` (JavaScript) | `.ts` / `.js` (TypeScript/JavaScript) |
| VS Code ecosystem fit | Direct (runs in Node VM) | Requires WASM bundle in webview |
| Maturity | Mature, stable | Active development, newer |
| License | MIT | MIT |

---

## Integration Approaches

### Option A: Webview-only engine (recommended for initial investigation)

OpenGeometry is WASM-based and runs in a browser environment, making it a natural fit for HootCAD's existing webview. In this model:

- The user writes an OpenGeometry script (TypeScript/JavaScript)
- The extension hosts the script execution inside the webview (instead of the extension host Node VM)
- OpenGeometry's Three.js integration renders geometry directly, without a separate conversion step

**Pros:**
- Leverages WASM performance for heavy geometry
- No serialization overhead — geometry stays in the webview
- Native Three.js output, eliminating `threeJsConverter.ts` for OpenGeometry geometries
- STEP/IFC export would become feasible

**Cons:**
- Script execution moves from the extension host (Node VM) to the webview sandbox
- Loses direct access to the VS Code API from user scripts
- WASM bundle increases extension size (`.wasm` file bundled)
- CSP changes required: `wasm-unsafe-eval` must be allowed in the webview `Content-Security-Policy`

### Option B: Hybrid — JSCAD + OpenGeometry side by side

Support both engines simultaneously, detected by file extension or a pragma comment:

- `.jscad` files → existing JSCAD pipeline (unchanged)
- `.ogcad` / `.ts` files with an OpenGeometry import → new OpenGeometry pipeline

This approach preserves backward compatibility while unlocking OpenGeometry features for new scripts.

**Pros:**
- Zero breaking change for existing users
- Users opt-in to OpenGeometry when they need BREP, STEP export, or performance

**Cons:**
- Two separate pipelines to maintain
- Webview must conditionally load the WASM module
- More complexity in `webviewManager.ts` and `webviewContentProvider.ts`

### Option C: OpenGeometry as a rendering backend only

Keep JSCAD as the scripting model, but use OpenGeometry's WASM triangulation and BREP operations as a post-processing step after JSCAD execution.

**Pros:**
- No changes to user-facing scripting
- Potentially more accurate geometry for complex models

**Cons:**
- Requires translating JSCAD geometry → OpenGeometry geometry → Three.js
- Extra complexity with minimal scripting benefit for users
- Adds WASM dependency without a clear user-visible improvement

---

## Technical Challenges

### 1. WASM loading in VS Code webview

VS Code webviews use a strict Content Security Policy. Loading WASM requires:
- Bundling the `.wasm` file inside the extension's `dist/` output
- Referencing it via `webview.asWebviewUri()` (not a relative path)
- Updating the webview `<meta http-equiv="Content-Security-Policy">` to include `'wasm-unsafe-eval'`

### 2. Script execution model

JSCAD scripts execute in a Node.js VM on the extension host. OpenGeometry is designed for browser execution. Supporting OpenGeometry scripts would require:
- A new execution path that runs user code inside the webview (via `postMessage` injection or a sandboxed `<script>` tag)
- Or a bundler step that pre-compiles user `.ts` files before passing to the webview

### 3. Export pipeline

Current exports use JSCAD serializers on the extension host. For OpenGeometry:
- STL/STEP export would need to happen inside the webview and be sent back to the extension host via `postMessage`
- The extension host would then write the file to disk
- IFC/STEP exports are listed as experimental in OpenGeometry

### 4. Extension size

The OpenGeometry WASM binary adds to the extension's `.vsix` size. The current extension has no WASM dependencies. This should be evaluated against the VS Code Marketplace size limits and user download experience.

### 5. File type registration

A new language/file association would be needed (e.g., `.ogcad`) or a detection heuristic (e.g., a file that `import`s from `'opengeometry'`).

---

## Recommended Next Steps

1. **Prototype WASM loading in the webview**: Create a minimal proof-of-concept that loads the OpenGeometry WASM module in a VS Code webview with the required CSP and `asWebviewUri` setup.

2. **Define the scripting model**: Decide whether OpenGeometry scripts are evaluated in the extension host (requires bundling), in the webview (requires postMessage bridge), or pre-compiled before execution.

3. **Evaluate export feasibility**: Test whether OpenGeometry's STL and STEP serializers produce valid output that can be streamed back to the extension host via `postMessage`.

4. **Choose Option A or B**: For a clean initial implementation, Option B (hybrid, side-by-side) is lower risk. Option A (webview-only engine) is architecturally simpler for OpenGeometry specifically.

5. **Measure WASM bundle size**: Run `npm pack opengeometry` and measure the WASM artifact size to assess impact on `.vsix` distribution.

6. **Align with existing roadmap**: OpenGeometry's BREP capabilities would complement Phase 6 (OpenCascade Integration) from the ROADMAP. Consider whether OpenGeometry could partially or fully replace the planned OpenCascade integration, given its web-native design.

---

## Conclusion

OpenGeometry is a strong candidate for extending HootCAD's geometry capabilities, particularly for:

- **BREP-based modeling** (faces, edges, vertices — not currently possible with JSCAD)
- **STEP/IFC export** for professional manufacturing and BIM workflows
- **Performance-sensitive models** that hit JavaScript limits in JSCAD

The primary integration challenge is its WASM execution model, which differs fundamentally from JSCAD's Node.js VM approach. A hybrid pipeline (Option B) minimizes risk while giving users a migration path. The webview-side WASM loading challenges are well-understood and solvable with existing VS Code APIs.

An initial proof-of-concept focused on WASM loading and a minimal render-loop in the webview is the recommended first step before committing to a full implementation.

---

## References

- [OpenGeometry GitHub](https://github.com/OpenGeometry-io/OpenGeometry)
- [OpenGeometry Documentation](https://docs.opengeometry.io/OpenGeometry/what-is-opengeometry)
- [OpenGeometry npm package](https://www.npmjs.com/package/opengeometry)
- [JSCAD Modeling](https://github.com/jscad/OpenJSCAD.org)
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [HootCAD ROADMAP](../ROADMAP.md)
- [HootCAD ARCHITECTURE](../ARCHITECTURE.md)
