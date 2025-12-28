# HootCAD Test Suite

## Test Structure

### Test Files

- **extension.test.ts** - Extension activation and registration tests
- **jscadEngine.test.ts** - Core JSCAD engine functionality tests

### Test Fixtures (`fixtures/`)

Test JSCAD files for various scenarios:

- `valid-cube.jscad` - Simple valid file returning single geometry
- `valid-multiple.jscad` - Valid file returning array of geometries  
- `no-main.jscad` - Invalid file missing main() export
- `syntax-error.jscad` - File with syntax error
- `runtime-error.jscad` - File that throws runtime error
- `test-package.json` - Valid package.json with .jscad main
- `invalid-main-package.json` - package.json with non-.jscad main

## Test Coverage

### Entrypoint Resolution Tests
✅ Null case (no workspace, no active editor)  
✅ package.json main field resolution  
✅ Skipping invalid package.json main  
✅ index.jscad fallback  
✅ Active editor fallback (implicit in integration)

### JSCAD Execution Tests
✅ Valid single geometry  
✅ Valid multiple geometries  
✅ Missing main() function error  
✅ Syntax error handling  
✅ Runtime error handling  
✅ Require cache clearing  
✅ Single geometry wrapping  
✅ Array preservation

### Error Handling Tests
✅ Detailed error messages  
✅ Non-existent file handling

### OutputChannel Integration Tests
✅ Logging execution events  
✅ Logging errors

## Running Tests

```bash
# Compile tests
npm run compile-tests

# Run tests in VS Code
npm test

# Or use VS Code Test Explorer
```

## Test Philosophy

We test **HootCAD's internal logic**, not JSCAD itself:

- ✅ Test entrypoint resolution logic
- ✅ Test error handling and reporting
- ✅ Test file loading and cache management
- ✅ Test geometry array handling
- ❌ Don't test JSCAD's geometry generation
- ❌ Don't test JSCAD's modeling functions

## Adding New Tests

1. Add fixture files to `fixtures/` if needed
2. Write test in appropriate suite
3. Run `npm run compile-tests` to check for errors
4. Run `npm test` to execute

## Notes on Workspace Tests

Some entrypoint resolution tests create temporary workspace directories because VS Code's workspace resolution depends on actual folder structures. These tests:

- Create temporary directories in `fixtures/workspace-test-*`
- Use `vscode.commands.executeCommand('vscode.openFolder', ...)` to load workspaces
- Clean up after themselves
- May be slow due to workspace loading delays

Alternative approach: Mock `vscode.workspace` API (more complex, but faster).
