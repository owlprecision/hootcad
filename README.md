# HootCAD 🦉

**Design CAD models with code. Preview in real-time. Export to production.**

HootCAD brings scriptable CAD workflows to VS Code and Cursor. Write JSCAD scripts, see instant 3D previews, and export to formats ready for manufacturing.

> Works seamlessly in both VS Code and Cursor IDE

## Why HootCAD?

Traditional CAD tools treat designs as opaque binary files. HootCAD embraces a different philosophy: **design is code, code is design.** This means:

- ✅ **Version control** your designs with meaningful diffs
- ✅ **Parametric designs** that adapt to your specifications
- ✅ **Code review** CAD models like software
- ✅ **Collaborate** with teammates using standard dev workflows
- ✅ **AI-assisted** design with MCP integration for coding agents

## Core Features

🎨 **Live 3D Preview** - Instant WebGL rendering of JSCAD scripts with interactive camera controls

📦 **Multi-Format Export** - Export to STL, OBJ, AMF, DXF, SVG, and more for 3D printing or manufacturing

🤖 **MCP Server** - Optional Model Context Protocol server for AI coding agents (safe math evaluation, CAD guidance)

⚡ **Smart Resolution** - Automatically finds your JSCAD entrypoint (package.json, index.jscad, or active file)

## Installation

Install directly from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=owlprecision.hootcad):

1. Open VS Code or Cursor
2. Press `Ctrl+Shift+P` (`Cmd+Shift+P` on Mac)
3. Type "Extensions: Install Extensions"
4. Search for "HootCAD"
5. Click Install

Or install with one click from the [marketplace page](https://marketplace.visualstudio.com/items?itemName=owlprecision.hootcad).

## Quick Start

**Create your first CAD model in 60 seconds:**

1. Create a new file `cube.jscad`:
   ```javascript
   const { cube } = require('@jscad/modeling').primitives
   
   const main = () => cube({ size: 10 })
   
   module.exports = { main }
   ```

2. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)

3. Run **HootCAD: Open Preview**

4. Interact with your 3D model:
   - **Drag** to rotate
   - **Scroll** to zoom

5. Export to STL, OBJ, or other formats via **HootCAD: Export**

💡 Check the [examples](https://github.com/owlprecision/hootcad/tree/main/examples) directory for more sample models.

## Available Commands

| Command | Description |
|---------|-------------|
| **HootCAD: Open Preview** | Opens a live 3D preview of your JSCAD model |
| **HootCAD: Export** | Export to STL, OBJ, AMF, DXF, SVG, JSON, or X3D |
| **HootCAD: Enable MCP Server** | Enable AI agent integration (optional) |

## AI Agent Integration (Optional)

HootCAD includes an optional **Model Context Protocol (MCP) server** for AI coding agents like GitHub Copilot and Cursor:

**🤖 CAD Guidance** - Get expert design advice for JSCAD, manufacturability, and spatial reasoning

**🧮 Safe Math** - Evaluate dimensional calculations without arbitrary code execution

**🔒 Security-First** - No filesystem access, no eval, no code execution - just safe math operations

Enable via **HootCAD: Enable MCP Server** command when prompted. The extension provides setup instructions for your coding agent.

## Support & Contributing

- **Report Issues**: [GitHub Issues](https://github.com/owlprecision/hootcad/issues)
- **Source Code**: [github.com/owlprecision/hootcad](https://github.com/owlprecision/hootcad)
- **Contributing**: See [CONTRIBUTING.md](https://github.com/owlprecision/hootcad/blob/main/CONTRIBUTING.md)

## License

MIT License - see [LICENSE](https://github.com/owlprecision/hootcad/blob/main/LICENSE) file for details
