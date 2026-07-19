-- Seed bundled MCP servers (run in-process; transport 'builtin'). Rollback: DELETE FROM mcp_servers WHERE builtin = 1; DROP INDEX mcp_servers_name;
CREATE UNIQUE INDEX mcp_servers_name ON mcp_servers(name);

INSERT INTO mcp_servers (id, name, transport, builtin) VALUES
	('builtin-webfetch', 'webfetch', 'builtin', 1),
	('builtin-datetime', 'datetime', 'builtin', 1),
	('builtin-chat-search', 'chat-search', 'builtin', 1),
	('builtin-documents', 'documents', 'builtin', 1),
	('builtin-bash', 'bash', 'builtin', 1),
	('builtin-settings', 'settings', 'builtin', 1);
