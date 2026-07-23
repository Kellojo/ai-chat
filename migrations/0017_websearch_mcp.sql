-- Seed the built-in websearch MCP server (SearXNG-backed web search). Rollback: DELETE FROM mcp_servers WHERE id = 'builtin-websearch';
INSERT INTO mcp_servers (id, name, transport, builtin) VALUES ('builtin-websearch', 'websearch', 'builtin', 1);
