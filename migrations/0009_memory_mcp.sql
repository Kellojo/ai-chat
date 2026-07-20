-- Seed the built-in memory MCP server. Rollback: DELETE FROM mcp_servers WHERE id = 'builtin-memory';
INSERT INTO mcp_servers (id, name, transport, builtin) VALUES ('builtin-memory', 'memory', 'builtin', 1);
