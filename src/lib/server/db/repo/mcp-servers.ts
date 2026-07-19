import { randomUUID } from 'node:crypto';
import { encryptSecret } from '../../crypto.js';
import type { Db } from '../index.js';

export type McpTransport = 'builtin' | 'stdio' | 'http' | 'sse';
export type McpMode = 'chat' | 'agent';

export interface McpServerRow {
	id: string;
	name: string;
	transport: McpTransport;
	command: string | null;
	args: string;
	url: string | null;
	token_enc: string | null;
	enabled: number;
	scopes: string;
	builtin: number;
}

export interface McpServer {
	id: string;
	name: string;
	transport: McpTransport;
	url: string | null;
	hasToken: boolean;
	enabled: boolean;
	scopes: McpMode[];
	builtin: boolean;
}

function parseScopes(raw: string): McpMode[] {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return ['chat', 'agent'];
		return parsed.filter((s): s is McpMode => s === 'chat' || s === 'agent');
	} catch {
		return ['chat', 'agent'];
	}
}

export function toPublic(row: McpServerRow): McpServer {
	return {
		id: row.id,
		name: row.name,
		transport: row.transport,
		url: row.url,
		hasToken: row.token_enc != null && row.token_enc.length > 0,
		enabled: row.enabled === 1,
		scopes: parseScopes(row.scopes),
		builtin: row.builtin === 1
	};
}

export function listMcpServers(db: Db): McpServerRow[] {
	return db
		.prepare('SELECT * FROM mcp_servers ORDER BY builtin DESC, name')
		.all() as McpServerRow[];
}

export function listEnabledMcpServers(db: Db, mode: McpMode): McpServerRow[] {
	return listMcpServers(db).filter(
		(row) => row.enabled === 1 && parseScopes(row.scopes).includes(mode)
	);
}

export function getMcpServer(db: Db, id: string): McpServerRow | undefined {
	return db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as McpServerRow | undefined;
}

export interface CreateMcpServerInput {
	name: string;
	transport: 'http' | 'sse';
	url: string;
	token?: string | null;
	enabled?: boolean;
	scopes?: McpMode[];
}

export function createMcpServer(db: Db, input: CreateMcpServerInput): McpServerRow {
	const id = randomUUID();
	db.prepare(
		`INSERT INTO mcp_servers (id, name, transport, url, token_enc, enabled, scopes, builtin)
		 VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
	).run(
		id,
		input.name,
		input.transport,
		input.url,
		input.token ? encryptSecret(input.token) : null,
		input.enabled === false ? 0 : 1,
		JSON.stringify(input.scopes ?? ['chat', 'agent'])
	);
	return getMcpServer(db, id)!;
}

export interface UpdateMcpServerInput {
	name?: string;
	transport?: 'http' | 'sse';
	url?: string | null;
	token?: string | null;
	enabled?: boolean;
	scopes?: McpMode[];
}

export function updateMcpServer(
	db: Db,
	id: string,
	patch: UpdateMcpServerInput
): McpServerRow | undefined {
	const existing = getMcpServer(db, id);
	if (!existing) return undefined;
	const isBuiltin = existing.builtin === 1;
	db.prepare(
		`UPDATE mcp_servers SET name = ?, transport = ?, url = ?, token_enc = ?, enabled = ?, scopes = ?
		 WHERE id = ?`
	).run(
		!isBuiltin && patch.name !== undefined ? patch.name : existing.name,
		!isBuiltin && patch.transport !== undefined ? patch.transport : existing.transport,
		!isBuiltin && patch.url !== undefined ? patch.url : existing.url,
		!isBuiltin && patch.token !== undefined
			? patch.token
				? encryptSecret(patch.token)
				: null
			: existing.token_enc,
		patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : existing.enabled,
		patch.scopes !== undefined ? JSON.stringify(patch.scopes) : existing.scopes,
		id
	);
	return getMcpServer(db, id);
}

export function deleteMcpServer(db: Db, id: string): boolean {
	const existing = getMcpServer(db, id);
	if (!existing || existing.builtin === 1) return false;
	return db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id).changes > 0;
}
