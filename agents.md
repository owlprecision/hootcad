# Agent notes (HootCAD)

## MCP server versioning

When the MCP tool list changes (add/remove/rename tools, change input schemas, or change tool behavior in a way that should invalidate cached metadata), bump the MCP server version.

- Version source of truth: `src/mcpVersion.ts` (`MCP_SERVER_VERSION`)
- Server advertises this version in `src/mcpServer.ts`
- VS Code’s MCP definition uses the same version in `src/mcpDefinitionProvider.ts`

Why: some clients cache tool metadata per server/version. Bumping the version helps force a refresh so the updated tool list becomes visible.

Checklist when changing tools:
- Update tool definitions in `src/mcpServer.ts` (`ListToolsRequestSchema` handler)
- Bump `MCP_SERVER_VERSION` in `src/mcpVersion.ts`
- Rebuild (`npm run watch` / `npm run compile`) and verify `listTools()` shows the expected tools
