# HootCAD Extension Architecture

## Overview

The HootCAD extension has been refactored into a modular architecture that separates concerns into well-defined subsystems. This document describes the new structure and the responsibilities of each module.

## Module Structure

```
src/
├── extension.ts                    # Entry point - minimal, delegates to lifecycle
├── extensionLifecycle.ts          # Extension activation, commands, and watchers
├── webviewManager.ts              # Webview panel lifecycle and messaging
├── webviewContentProvider.ts      # HTML template generation
├── errorReporter.ts               # Centralized error handling and logging
├── utilities.ts                   # Shared utility functions
├── jscadEngine.ts                 # JSCAD execution engine (existing)
├── parameterCache.ts              # Parameter value caching (existing)
└── threeJsConverter.ts            # JSCAD to Three.js conversion (existing)
```

## Module Responsibilities

### extension.ts
**Purpose:** Entry point for the VS Code extension

**Responsibilities:**
- Exports `activate()` and `deactivate()` functions required by VS Code
- Creates and initializes the `ExtensionLifecycle`
- Minimal code - delegates all work to other modules

**Key Design:** Keep this file as small as possible to make the extension easy to understand at a glance.

---

### extensionLifecycle.ts
**Purpose:** Manages the extension lifecycle

**Responsibilities:**
- Creates and wires up all major subsystems (error reporter, webview manager, parameter cache)
- Registers VS Code commands (`hootcad.openPreview`)
- Sets up file save watchers to auto-refresh preview
- Sets up active editor watchers to update status bar
- Manages status bar item

**Key Design:** This is the "composition root" where all dependencies are created and connected.

---

### webviewManager.ts
**Purpose:** Manages the webview panel lifecycle and communication

**Responsibilities:**
- Creates and shows the webview panel
- Handles webview messaging (ready, parameter changes, etc.)
- Coordinates JSCAD execution and rendering
- Updates webview content when files change
- Manages panel state (open/closed, title)

**Key Design:** Encapsulates all webview-related logic, making it easy to modify how the preview works.

---

### webviewContentProvider.ts
**Purpose:** Generates HTML content for the webview

**Responsibilities:**
- Generates complete HTML template for the preview
- Manages resource URIs (Three.js library)
- Provides CSS styles
- Provides client-side JavaScript for Three.js rendering
- Includes JSCAD to Three.js converter inline

**Key Design:** Separates HTML generation from business logic. Makes it easy to modify the UI without touching the extension logic. The HTML is broken into logical methods (styles, body content, client script) for better maintainability.

---

### errorReporter.ts
**Purpose:** Centralized error handling and logging

**Responsibilities:**
- Logs informational messages to output channel
- Reports errors with context to both output channel and user notifications
- Extracts error messages and stack traces
- Reports source locations from stack traces
- Logs parameter snapshots for debugging

**Key Design:** Single place for all error handling logic. Consistent error reporting across the extension.

---

### utilities.ts
**Purpose:** Shared utility functions

**Responsibilities:**
- `extractFilename()` - Extracts filename from file path
- `formatPreviewTitle()` - Formats preview window title with owl emoji

**Key Design:** Common utilities that are used by multiple modules. Easy to test and reuse.

---

### jscadEngine.ts (existing)
**Purpose:** JSCAD file execution and parameter handling

**Responsibilities:**
- Resolves JSCAD entrypoint (package.json main, index.jscad, or active editor)
- Loads and executes JSCAD files in VM context
- Extracts parameter definitions from JSCAD files
- Serializes JSCAD geometries for webview

**No changes made** - Already well-structured.

---

### parameterCache.ts (existing)
**Purpose:** Caches user parameter values

**Responsibilities:**
- Stores parameter values per file path
- Merges cached values with parameter definitions
- Persists cache to VS Code workspace state
- Handles parameter type coercion

**No changes made** - Already well-structured.

---

### threeJsConverter.ts (existing)
**Purpose:** Converts JSCAD geometries to Three.js format

**Responsibilities:**
- Triangulates JSCAD polygons
- Converts geom3 (3D solids) to Three.js BufferGeometry
- Converts geom2 (2D paths) to Three.js line geometry
- Type guards for geometry types

**No changes made** - Already well-structured.

---

## Benefits of This Architecture

1. **Separation of Concerns:** Each module has a clear, focused responsibility
2. **Testability:** Modules can be tested independently
3. **Maintainability:** Changes to one subsystem don't affect others
4. **Readability:** Smaller files are easier to understand
5. **Extensibility:** Easy to add new features (e.g., new renderers, new languages)
6. **IDE Integration:** Better code navigation and IntelliSense

## Future Extensibility

This architecture supports future enhancements:

- **Multiple Languages:** Add new language engines alongside jscadEngine.ts
- **Alternative Renderers:** Create new content providers for different rendering approaches
- **Advanced Error Reporting:** Enhance errorReporter.ts with more sophisticated diagnostics
- **Plugin System:** Extension lifecycle can be extended to support plugins
- **Better UI:** webviewContentProvider.ts can be replaced or enhanced with React/Vue components

## Migration Notes

The refactoring maintains 100% backward compatibility:
- All existing tests pass
- No changes to public APIs
- No changes to package.json or extension manifest
- No changes to JSCAD engine or parameter handling
- Same user-facing behavior

The only breaking change is internal: code that directly imported helper functions from `extension.ts` now needs to import from `utilities.ts` (this only affects tests).
