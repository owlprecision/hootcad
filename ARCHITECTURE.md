# HootCAD Extension Architecture

## Overview

HootCAD uses a modular architecture with clear separation of concerns. Each module has focused responsibilities, making the codebase maintainable and extensible.

## Core Modules

### extension.ts
**Entry point** - Exports `activate()` and `deactivate()` required by VS Code. Delegates to `ExtensionLifecycle`.

### extensionLifecycle.ts
**Lifecycle management** - Wires up subsystems, registers commands, manages file watchers and status bar.

### webviewManager.ts
**Webview lifecycle** - Creates panels, handles messaging, coordinates JSCAD execution and rendering.

### webviewContentProvider.ts
**HTML generation** - Generates webview content, manages resource URIs, provides client-side Three.js rendering.

### errorReporter.ts
**Error handling** - Centralized logging and error reporting to output channel and notifications.

### jscadEngine.ts
**JSCAD execution** - Resolves entrypoints, executes files in VM context, serializes geometries.

### mcpServer.ts & mcpManager.ts
**MCP integration** - Optional Model Context Protocol server with safe math evaluation for AI agents.

### parameterCache.ts
**Parameter persistence** - Caches user parameter values per file in workspace state.

### threeJsConverter.ts
**Geometry conversion** - Converts JSCAD geometries to Three.js format for WebGL rendering.

### utilities.ts
**Shared utilities** - Common helper functions used across modules.

## Design Principles

1. **Separation of Concerns** - Each module has a focused responsibility
2. **Testability** - Modules can be tested independently
3. **Maintainability** - Changes to one subsystem don't affect others
4. **Extensibility** - Easy to add new features without major refactoring

## Development Setup

```bash
git clone https://github.com/owlprecision/hootcad
cd hootcad
npm install
```

### Building
- `npm run compile` - Compile TypeScript
- `npm run watch` - Watch mode for development
- `npm run package` - Production build

### Testing
- `npm test` - Run test suite
- Press F5 in VS Code to launch Extension Development Host

### Debugging
- Set breakpoints in TypeScript source
- Press F5 to start debugging
- Check "HootCAD" output channel for logs
