import { describe, expect, it, vi } from 'vitest';

vi.resetModules();
process.env.DATABASE_PATH = ':memory:';
process.env.APP_SECRET = 'test-secret-test-secret';
process.env.SETTINGS_MCP_WRITE = 'false';

const { createSettingsServer } = await import('./settings.js');
const { getDb } = await import('../../db/index.js');
const { setSetting } = await import('../../db/repo/settings.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
const { createMCPClient } = await import('@ai-sdk/mcp');

async function callTool(name: string, args: Record<string, unknown>, role = 'admin') {
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const server = createSettingsServer({
		userId: 'u1',
		role,
		workspaceDir: null,
		documentsDir: ''
	});
	await server.connect(serverTransport);
	const client = await createMCPClient({ transport: clientTransport, maxRetries: 0 });
	try {
		const tools = await client.tools();
		const tool = tools[name] as unknown as {
			execute: (input: unknown, opts: unknown) => Promise<unknown>;
		};
		return await tool.execute(args, { toolCallId: 't1', messages: [] });
	} finally {
		await client.close();
		await server.close();
	}
}

function resultText(res: unknown): string {
	const r = res as { content?: Array<{ type: string; text?: string }> };
	return r.content?.[0]?.text ?? '';
}

function isErr(res: unknown): boolean {
	return (res as { isError?: boolean }).isError === true;
}

describe('settings server (writes disabled)', () => {
	it('rejects unknown setting keys', async () => {
		const res = await callTool('get_setting', { key: 'no-such-key' });
		expect(isErr(res)).toBe(true);
		expect(resultText(res)).toContain('unknown setting');
	});

	it('reads and lists stored settings', async () => {
		setSetting(getDb(), 'theme', 'dark');
		setSetting(getDb(), 'retries', 3);
		const got = await callTool('get_setting', { key: 'theme' });
		expect(isErr(got)).toBe(false);
		expect(JSON.parse(resultText(got))).toBe('dark');
		const listed = JSON.parse(resultText(await callTool('list_settings', {}))) as Record<
			string,
			unknown
		>;
		expect(listed.theme).toBe('dark');
		expect(listed.retries).toBe(3);
	});

	it('rejects update_setting when SETTINGS_MCP_WRITE=false, even for admins', async () => {
		const res = await callTool('update_setting', { key: 'theme', value: 'light' }, 'admin');
		expect(isErr(res)).toBe(true);
		expect(resultText(res)).toContain('SETTINGS_MCP_WRITE=false');
	});
});
