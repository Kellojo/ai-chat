import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.resetModules();
process.env.DATABASE_PATH = ':memory:';
process.env.APP_SECRET = 'test-secret-test-secret';

const { createDocumentsServer } = await import('./documents.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
const { createMCPClient } = await import('@ai-sdk/mcp');

let documentsDir: string;
let ctx: { userId: string; role: string; workspaceDir: null; documentsDir: string };

beforeAll(() => {
	documentsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
	ctx = { userId: 'u1', role: 'user', workspaceDir: null, documentsDir };
});

async function callTool(name: string, args: Record<string, unknown>) {
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const server = createDocumentsServer(ctx);
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

describe('documents server', () => {
	it('supports a full CRUD round-trip', async () => {
		expect(
			isErr(await callTool('create_document', { path: 'notes/a.txt', content: 'hello world' }))
		).toBe(false);
		expect(
			isErr(await callTool('create_document', { path: 'notes/a.txt', content: 'again' }))
		).toBe(true);

		const read = await callTool('read_document', { path: 'notes/a.txt' });
		expect(resultText(read)).toBe('hello world');

		expect(
			isErr(await callTool('update_document', { path: 'notes/a.txt', content: 'updated content' }))
		).toBe(false);
		expect(resultText(await callTool('read_document', { path: 'notes/a.txt' }))).toBe(
			'updated content'
		);

		expect(isErr(await callTool('delete_document', { path: 'notes/a.txt' }))).toBe(false);
		expect(isErr(await callTool('read_document', { path: 'notes/a.txt' }))).toBe(true);
	});

	it('lists documents with sizes as posix paths', async () => {
		await callTool('create_document', { path: 'docs/one.md', content: 'first doc' });
		await callTool('create_document', { path: 'two.md', content: 'second' });
		const res = await callTool('list_documents', {});
		const list = JSON.parse(resultText(res)) as Array<{ path: string; size: number }>;
		const paths = list.map((e) => e.path);
		expect(paths).toContain('docs/one.md');
		expect(paths).toContain('two.md');
		expect(list.find((e) => e.path === 'docs/one.md')?.size).toBe(9);

		const prefixed = JSON.parse(
			resultText(await callTool('list_documents', { prefix: 'docs' }))
		) as Array<{ path: string }>;
		expect(prefixed.map((e) => e.path)).toEqual(['docs/one.md']);
	});

	it('searches document contents with snippets', async () => {
		const res = await callTool('search_documents', { query: 'FIRST' });
		const hits = JSON.parse(resultText(res)) as Array<{ path: string; snippet: string }>;
		expect(hits.length).toBeGreaterThan(0);
		expect(hits[0].path).toBe('docs/one.md');
		expect(hits[0].snippet).toContain('first');
	});

	it('rejects paths escaping the documents root and missing documents', async () => {
		expect(isErr(await callTool('create_document', { path: '../escape.txt', content: 'x' }))).toBe(
			true
		);
		expect(isErr(await callTool('read_document', { path: '../escape.txt' }))).toBe(true);
		expect(isErr(await callTool('update_document', { path: 'missing.txt', content: 'x' }))).toBe(
			true
		);
		expect(isErr(await callTool('delete_document', { path: 'missing.txt' }))).toBe(true);
		expect(fs.existsSync(path.join(documentsDir, '..', 'escape.txt'))).toBe(false);
	});
});
