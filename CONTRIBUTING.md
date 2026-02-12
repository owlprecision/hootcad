# Contributing to HootCAD

Thank you for your interest in contributing to HootCAD! This guide will help you get started.

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/owlprecision/hootcad
   cd hootcad
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Open in VS Code**
   ```bash
   code .
   ```

4. **Start developing**
   - Press `F5` to launch the Extension Development Host
   - Make changes to the code
   - Press `Ctrl+R` (`Cmd+R` on Mac) in the Extension Development Host to reload

## Building and Testing

- **Compile**: `npm run compile`
- **Watch mode**: `npm run watch`
- **Run tests**: `npm test`
- **Lint code**: `npm run lint`
- **Package**: `npm run package:vsix`

## Code Structure

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed information about the codebase structure.

## Making Changes

1. **Create an issue** - Discuss your proposed changes first
2. **Fork the repository** - Create your own fork
3. **Create a branch** - Use a descriptive name (e.g., `feature/export-gltf`)
4. **Make your changes** - Follow existing code style
5. **Test thoroughly** - Ensure all tests pass
6. **Submit a pull request** - Reference the issue you're addressing

## Code Style

- Follow TypeScript best practices
- Use meaningful variable and function names
- Add comments for complex logic
- Run `npm run lint` before committing

## MCP Server Development

When making changes to MCP tools:

### Version Bumping

If you change the MCP tool list (add/remove/rename tools, change schemas, or change behavior), bump the MCP server version:

1. Update `MCP_SERVER_VERSION` in `src/mcpVersion.ts`
2. Rebuild the extension
3. Verify tools appear correctly in `listTools()`

This ensures clients with cached metadata refresh to see updated tools.

### Checklist for MCP Changes
- [ ] Update tool definitions in `src/mcpServer.ts`
- [ ] Bump `MCP_SERVER_VERSION` in `src/mcpVersion.ts`
- [ ] Rebuild and verify with `npm run compile`
- [ ] Test with an MCP client

## Questions?

Open an issue for questions or discussion: [github.com/owlprecision/hootcad/issues](https://github.com/owlprecision/hootcad/issues)
