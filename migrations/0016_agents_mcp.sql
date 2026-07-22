-- Seed the built-in agents MCP server (create/update agents from chat). Rollback: DELETE FROM mcp_servers WHERE id = 'builtin-agents';
INSERT INTO mcp_servers (id, name, transport, builtin) VALUES ('builtin-agents', 'agents', 'builtin', 1);
