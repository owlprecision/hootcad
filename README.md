# HootCAD

VS Code extension to view and render JSCAD files in 3D

## Features

- **JSCAD 3D Rendering** - Execute and visualize JSCAD scripts in real-time
- **Smart Entrypoint Resolution** - Automatically finds your JSCAD entrypoint via package.json, index.jscad, or active editor
- **Interactive 3D Viewer** - WebGL-based rendering with camera controls (rotate with mouse drag, zoom with mouse wheel)
- **Export to Multiple Formats** - Export your JSCAD models to STL, OBJ, AMF, DXF, SVG, JSON, and X3D formats
- **HootCAD: Open Preview** command to open a preview panel
- **HootCAD: Export** command to export models to various formats
- Activates automatically when opening `.jscad` files
- Output channel "HootCAD" for logging and error messages
- Status bar indicator showing current file and execution status

## Quick Start

1. Install the extension
2. Open a `.jscad` file (see `examples/` directory for samples)
3. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) and run **HootCAD: Open Preview**
4. View your 3D geometry in the preview panel
5. Interact with the 3D view:
   - **Left click + drag**: Rotate camera
   - **Mouse wheel**: Zoom in/out
6. To export your model:
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Run **HootCAD: Export**
   - Select the desired export format
   - Choose export options (if required)
   - Select save location and filename

## JSCAD Entrypoint Resolution

HootCAD automatically finds your JSCAD entrypoint using this priority:

1. **package.json main field** - If exists and points to a `.jscad` file
2. **index.jscad** - At workspace root
3. **Active editor** - Currently open `.jscad` file

If no entrypoint is found, an error message will guide you.

## Example JSCAD File

```javascript
const { cube } = require('@jscad/modeling').primitives

const main = () => cube({ size: 10 })

module.exports = { main }
```

See the `examples/` directory for more examples including sphere, snowman, and other shapes.

## Export Formats

HootCAD supports exporting to the following formats using official JSCAD serializers:

### 3D Formats
- **STL** (Stereolithography) - Common format for 3D printing
  - Options: Binary or ASCII format
- **OBJ** (Wavefront Object) - Common 3D mesh format
  - Options: Triangle or polygon faces
- **AMF** (Additive Manufacturing Format) - Advanced 3D printing format
  - Options: Unit of measurement (mm, inch, feet, meter, micrometer)
- **X3D** (Extensible 3D) - ISO standard for 3D graphics

### 2D Formats
- **SVG** (Scalable Vector Graphics) - Vector graphics for 2D geometries
  - Options: Unit of measurement (mm, cm, in, px, pt, pc, em, ex)
- **DXF** (Drawing Exchange Format) - CAD interchange format supporting 2D and 3D

### Universal Format
- **JSON** - JSCAD native geometry format (supports all geometry types)

### Using the Export Command

1. Open or create a `.jscad` file
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
3. Type "HootCAD: Export" and select the command
4. Choose your export format from the list
5. Configure format-specific options (if any)
6. Select where to save the file
7. The export will run with progress feedback
8. You'll be notified when the export completes

The export command automatically resolves the JSCAD entrypoint using the same logic as the preview command.

## Development

### Prerequisites

- Node.js (v14 or higher)
- VS Code

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Extension (F5)

1. Open the project in VS Code
2. Press `F5` to open a new Extension Development Host window
3. In the Extension Development Host:
   - Create or open a `.jscad` file
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) to open the command palette
   - Type "HootCAD: Open Preview" and select the command
   - The preview panel will open on the right side
4. Make changes to the extension code
5. Press `Ctrl+R` (or `Cmd+R` on Mac) in the Extension Development Host to reload the extension

### Building

To compile the extension:
```bash
npm run compile
```

To watch for changes and compile automatically:
```bash
npm run watch
```

### Testing

To run tests:
```bash
npm test
```

### Packaging and Installing Locally

1. Install `vsce` (VS Code Extension Manager):
   ```bash
   npm install -g @vscode/vsce
   ```

2. Package the extension into a `.vsix` file:
   ```bash
   vsce package
   ```
   This will create a file like `hootcad-0.0.1.vsix`

3. Install the `.vsix` file in VS Code:
   - **Option 1: Using Command Palette**
     - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
     - Type "Extensions: Install from VSIX..."
     - Select the generated `.vsix` file
   
   - **Option 2: Using Command Line**
     ```bash
     code --install-extension hootcad-0.0.1.vsix
     ```

4. Reload VS Code to activate the extension

### Debugging

- Set breakpoints in the TypeScript source files
- Press `F5` to start debugging
- Breakpoints will be hit in the Extension Development Host
- Use the Debug Console in VS Code to view output and evaluate expressions
- Check the "HootCAD" output channel for extension logs

## Usage

1. Open a `.jscad` file in VS Code (or create one - see examples below)
2. The extension will activate automatically
3. Open the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
4. Run **HootCAD: Open Preview**
5. The 3D preview panel will open showing your rendered geometry
6. Interact with the 3D view using mouse controls
7. Check the "HootCAD" output channel for execution logs and errors

### Example JSCAD Files

The `examples/` directory contains sample files:
- `cube.jscad` - Simple cube
- `sphere.jscad` - Sphere
- `snowman.jscad` - Complex model with multiple primitives

## CI/CD and Releases

This project uses GitHub Actions for continuous integration and automated releases.

### Versioning

The extension uses semantic versioning with automatic patch version updates:

- **Version Format**: `MAJOR.MINOR.PATCH`
- **Source**: The `version` field in `package.json` defines the MAJOR.MINOR version
- **Automatic Patch**: On pushes to the `main` branch, the PATCH number is automatically set to the GitHub Actions run number

**Examples:**
- If `package.json` has `"version": "0.0.1"` and the GitHub Actions run number is 43, the published version will be `0.0.43`
- If `package.json` has `"version": "1.3.0"` and the run number is 43, the published version will be `1.3.43`

### Automated Releases

On every push to the `main` branch:
1. The extension is built and tested
2. The version is automatically updated with the run number
3. A `.vsix` package is created
4. A GitHub release is created with the versioned tag (e.g., `v0.0.43`)
5. The `.vsix` file is attached to the release

### Manual Installation from Releases

To install a specific release:
1. Go to the [Releases page](https://github.com/joelmartinez/hootcad/releases)
2. Download the `.vsix` file from the desired release
3. In VS Code, press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
4. Type "Extensions: Install from VSIX..." and select the downloaded file

## Project Structure

- `src/extension.ts` - Main extension code and webview management
- `src/jscadEngine.ts` - JSCAD execution and geometry serialization
- `examples/` - Sample JSCAD files
- `package.json` - Extension manifest
- `tsconfig.json` - TypeScript configuration
- `webpack.config.js` - Webpack bundler configuration
- `.vscode/` - VS Code workspace settings and launch configurations

## Current Scope

This is a v0.5 implementation focused on core rendering functionality:

✅ **Implemented:**
- Execute JSCAD files with `main()` function
- Render 3D geometry (geom3) in WebGL viewer
- Smart entrypoint resolution
- Basic camera controls (rotate, zoom)
- Error handling and logging
- Export to STL, OBJ, AMF, DXF, SVG, JSON, and X3D formats
- Format-specific export options
- Interactive parameter UI (`getParameterDefinitions`)

❌ **Not yet implemented (future milestones):**
- Multi-file dependency tracking
- File watching and auto-refresh (for preview)
- Export to STEP format (requires OpenCascade integration)
- Advanced rendering (lighting, materials, shadows)
- 2D geometry rendering optimization
