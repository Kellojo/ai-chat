import { createMCPClient, type MCPClient, type MCPTransport } from '@ai-sdk/mcp';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { decryptSecret } from '../crypto.js';
import type { Db } from '../db/index.js';
import { getMcpServer, type McpServerRow } from '../db/repo/mcp-servers.js';
import { BUILTIN_SERVERS } from './servers/index.js';
import type { CallerContext } from './types.js';

export interface ServerConnection {
	client: MCPClient;
	close: () => Promise<void>;
}

export async function connectServer(
	row: McpServerRow,
	ctx: CallerContext
): Promise<ServerConnection> {
	if (row.transport === 'builtin') {
		const factory = BUILTIN_SERVERS[row.name];
		if (!factory) throw new Error(`Unknown builtin MCP server: ${row.name}`);
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
		const server = factory(ctx);
		await server.connect(serverTransport);
		const client = await createMCPClient({
			transport: clientTransport as unknown as MCPTransport,
			maxRetries: 2
		});
		return {
			client,
			close: async () => {
				await client.close();
				await server.close();
			}
		};
	}
	if (!row.url) throw new Error(`MCP server ${row.name} has no url configured`);
	const headers: Record<string, string> = {};
	if (row.token_enc) headers.authorization = `Bearer ${decryptSecret(row.token_enc)}`;
	const client = await createMCPClient({
		transport: { type: row.transport === 'sse' ? 'sse' : 'http', url: row.url, headers },
		maxRetries: 2
	});
	return { client, close: () => client.close() };
}

export interface TestConnectionTool {
	name: string;
	description?: string;
}

export interface TestConnectionResult {
	ok: boolean;
	tools: TestConnectionTool[];
	error?: string;
}

const TEST_CTX: CallerContext = {
	userId: 'connection-test',
	role: 'admin',
	workspaceDir: null,
	documentsDir: ''
};

export async function testConnection(db: Db, serverId: string): Promise<TestConnectionResult> {
	const row = getMcpServer(db, serverId);
	if (!row) return { ok: false, tools: [], error: 'Server not found' };
	try {
		const conn = await connectServer(row, TEST_CTX);
		try {
			const tools = await conn.client.tools();
			return {
				ok: true,
				tools: Object.entries(tools).map(([name, tool]) => ({
					name,
					description: typeof tool.description === 'string' ? tool.description : undefined
				}))
			};
		} finally {
			await conn.close();
		}
	} catch (e) {
		return { ok: false, tools: [], error: e instanceof Error ? e.message : String(e) };
	}
}
