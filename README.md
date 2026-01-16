# HootCAD

VS Code and Cursor extension to view and render JSCAD files in 3D

> **Works with both VS Code and Cursor IDE** - Install using the same extension package in either editor!

## Features

- **JSCAD 3D Rendering** - Execute and visualize JSCAD scripts in real-time
- **Smart Entrypoint Resolution** - Automatically finds your JSCAD entrypoint via package.json, index.jscad, or active editor
- **Interactive 3D Viewer** - WebGL-based rendering with camera controls (rotate with mouse drag, zoom with mouse wheel)
- **Export to Multiple Formats** - Export your JSCAD models to STL, OBJ, AMF, DXF, SVG, JSON, and X3D formats
- **MCP Validation Server** - Optional local server for coding agents to safely evaluate math and validate models
- **HootCAD: Open Preview** command to open a preview panel
- **HootCAD: Export** command to export models to various formats
- **HootCAD: Enable MCP Server** command to enable agent integration
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

## MCP Validation Server (Optional)

HootCAD includes an optional Model Context Protocol (MCP) server that provides safe math evaluation for coding agents. This feature enables agents to:
- Safely evaluate numeric expressions without arbitrary code execution
- Validate dimensional math and spatial relationships
- Perform sanity checks on CAD parameters
- Support agent validation workflows

### Enabling the MCP Server

1. **Via Command**: Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) and run **HootCAD: Enable MCP Server**
2. **Via Prompt**: The extension will prompt you to enable the server the first time you open a preview

When enabled, the extension will provide configuration instructions for integrating with your coding agent.

### Security Model

The MCP server is designed with security as the top priority:
- ✅ No arbitrary code execution (no `eval`, no `Function` constructor)
- ✅ No filesystem, environment variable, or VS Code API access
- ✅ No network access
- ✅ All inputs validated and treated as untrusted
- ✅ Expression length and complexity limits enforced
- ✅ Uses mathjs with dangerous APIs explicitly disabled

### Available Tools

**`cad_advice`** - Get expert CAD design guidance (CALL THIS FIRST before any CAD work)
- Provides essential guidance for CAD design, JSCAD programming, and manufacturability
- Available categories:
  - `general` (default): Core CAD advice, spatial reasoning, JSCAD primitives, emphasizes using cad_math
  - `dfm`: Design for Manufacturing - 3D printing constraints, tolerances, clearances
  - `jscad-specific`: JSCAD syntax, module system, transforms, common gotchas
- Returns structured advice as markdown with metadata

Example usage by coding agents:
```json
{
  "tool": "cad_advice",
  "arguments": {
    "category": "general"
  }
}
// Returns: { "category": "general", "availableCategories": [...], "content": "..." }
```

**`cad_math`** - Safely evaluate pure numeric expressions (recommended for derived CAD dimensions)
- Supports basic arithmetic (`+`, `-`, `*`, `/`, `%`)
- Exponentiation using `^` operator or `pow()` function
- Whitelisted math functions (sqrt, abs, sin, cos, etc.)
- Optional variable substitution
- Returns finite numeric results only

Example usage by coding agents:
```json
{
  "tool": "cad_math",
  "arguments": {
    "expr": "sqrt(x^2 + y^2)",
    "vars": { "x": 3, "y": 4 }
  }
}
// Returns: { "value": 5 }
```

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

#### For VS Code and Cursor

The same `.vsix` package works for both VS Code and Cursor IDE!

1. Install `vsce` (VS Code Extension Manager):
   ```bash
   npm install -g @vscode/vsce
   ```

2. Package the extension into a `.vsix` file:
   ```bash
   vsce package
   ```
   This will create a file like `hootcad-0.0.1.vsix`

3. Install the `.vsix` file:

   **In VS Code:**
   - **Option 1: Using Command Palette**
     - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
     - Type "Extensions: Install from VSIX..."
     - Select the generated `.vsix` file
   
   - **Option 2: Using Command Line**
     ```bash
     code --install-extension hootcad-0.0.1.vsix
     ```

   **In Cursor:**
   - **Option 1: Using Command Palette**
     - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
     - Type "Extensions: Install from VSIX..."
     - Select the generated `.vsix` file
   
   - **Option 2: Using Command Line**
     ```bash
     cursor --install-extension hootcad-0.0.1.vsix
     ```
   
   - **Option 3: Drag and Drop**
     - Open Cursor
     - Open the Extensions view (Ctrl+Shift+X / Cmd+Shift+X)
     - Drag and drop the `.vsix` file into the Extensions view

4. Reload VS Code or Cursor to activate the extension

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
3. A universal `.vsix` package is created (works for both VS Code and Cursor)
4. A GitHub release is created with the versioned tag (e.g., `v0.0.43`)
5. The `.vsix` file is attached to the release

**Note**: The same `.vsix` package works for both VS Code and Cursor IDE - no separate builds needed!

### Manual Installation from Releases (VS Code & Cursor)

The same `.vsix` file works for both VS Code and Cursor IDE!

To install a specific release:
1. Go to the [Releases page](https://github.com/joelmartinez/hootcad/releases)
2. Download the `.vsix` file from the desired release
3. Install in your editor:
   - **VS Code**: Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac), type "Extensions: Install from VSIX..." and select the downloaded file
   - **Cursor**: Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac), type "Extensions: Install from VSIX..." and select the downloaded file, or drag-and-drop the `.vsix` file into the Extensions view

### Publishing to Extension Marketplaces

For maximum distribution, the extension can be published to both marketplaces:

#### VS Code Marketplace
- Official Microsoft extension marketplace
- Used by VS Code users by default
- Publishing: `vsce publish`

#### OpenVSX Registry (Cursor's Default)
- Open-source, community-driven extension registry
- Used by Cursor IDE and other VS Code derivatives
- Publishing: `npx ovsx publish hootcad-x.x.x.vsix`

**The same `.vsix` package works for both marketplaces!** See [CURSOR_COMPATIBILITY.md](./CURSOR_COMPATIBILITY.md) for detailed compatibility information.

## Project Structure

- `src/extension.ts` - Main extension code and webview management
- `src/extensionLifecycle.ts` - Extension lifecycle, commands, and file watchers
- `src/mcpManager.ts` - MCP server lifecycle management
- `src/mcpServer.ts` - MCP server implementation with safe math evaluation
- `src/jscadEngine.ts` - JSCAD execution and geometry serialization
- `src/webviewManager.ts` - Webview panel lifecycle and messaging
- `examples/` - Sample JSCAD files
- `package.json` - Extension manifest
- `tsconfig.json` - TypeScript configuration
- `webpack.config.js` - Webpack bundler configuration
- `.vscode/` - VS Code workspace settings and launch configurations

## Current Scope

This is a v0.5 implementation focused on core rendering functionality:

✅ **Implemented:**
- **Multi-Editor Support**: Works in both VS Code and Cursor IDE
- Execute JSCAD files with `main()` function
- Render 3D geometry (geom3) in WebGL viewer
- Smart entrypoint resolution
- Basic camera controls (rotate, zoom)
- Error handling and logging
- Export to STL, OBJ, AMF, DXF, SVG, JSON, and X3D formats
- Format-specific export options
- Interactive parameter UI (`getParameterDefinitions`)
- **MCP Validation Server**: Optional local server for coding agents
  - Safe math expression evaluation (`cad_math` tool)
  - Security-hardened with no code execution
  - Support for agent validation workflows

❌ **Not yet implemented (future milestones):**
- Multi-file dependency tracking
- File watching and auto-refresh (for preview)
- Export to STEP format (requires OpenCascade integration)
- Advanced rendering (lighting, materials, shadows)
- 2D geometry rendering optimization
- Advanced MCP tools (geometry validation, constraint checking)
