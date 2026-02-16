# Agent Instructions

- Always run the full test suite before considering any piece of work done.
- If MCP tools are changed (add/remove/rename tools, modify tool input/output schemas, or change tool behavior), bump `MCP_SERVER_VERSION` in `src/mcpVersion.ts`.
- For MCP tool changes, ensure the version bump is included in the same change set so clients refresh cached tool metadata.
