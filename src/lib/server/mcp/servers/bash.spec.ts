import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.resetModules();
process.env.DATABASE_PATH = ':memory:';
process.env.APP_SECRET = 'test-secret-test-secret';

const { createBashServer } = await import('./bash.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
const { createMCPClient } = await import('@ai-sdk/mcp');

const B_TXT = 'alpha\nbeta needle gamma\ndelta\n';

let workspaceDir: string;
let ctx: { userId: string; role: string; workspaceDir: string | null; documentsDir: string };

beforeAll(() => {
	workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
	fs.mkdirSync(path.join(workspaceDir, 'src'), { recursive: true });
	fs.writeFileSync(path.join(workspaceDir, 'src', 'a.md'), '# Title\nline two\n');
	fs.writeFileSync(path.join(workspaceDir, 'src', 'b.txt'), B_TXT);
	fs.writeFileSync(path.join(workspaceDir, 'top.md'), '# top\n');
	const big = Array.from({ length: 60 }, (_, i) => `line ${String(i + 1).padStart(2, '0')}`).join(
		'\n'
	);
	fs.writeFileSync(path.join(workspaceDir, 'big.txt'), big);
	ctx = { userId: 'u1', role: 'user', workspaceDir, documentsDir: '' };
});

async function callTool(name: string, args: Record<string, unknown>, c: typeof ctx = ctx) {
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const server = createBashServer(c);
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

describe('bash server', () => {
	it('ls lists directories first', async () => {
		const out = resultText(await callTool('ls', {})).split('\n');
		expect(out).toContain('src/');
		expect(out).toContain('top.md');
		expect(out.indexOf('src/')).toBeLessThan(out.indexOf('top.md'));
	});

	it('cat prints file content', async () => {
		expect(resultText(await callTool('cat', { path: 'src/b.txt' }))).toBe(B_TXT);
	});

	it('head and tail slice lines', async () => {
		const head = resultText(await callTool('head', { path: 'big.txt', lines: 5 }));
		expect(head).toContain('line 01');
		expect(head).toContain('line 05');
		expect(head).not.toContain('line 06');
		const tail = resultText(await callTool('tail', { path: 'big.txt', lines: 2 }));
		expect(tail).toContain('line 60');
		expect(tail).not.toContain('line 58');
	});

	it('wc counts lines, words and bytes', async () => {
		const out = resultText(await callTool('wc', { path: 'src/b.txt' }));
		expect(out).toBe(`3 5 ${Buffer.byteLength(B_TXT)} src/b.txt`);
	});

	it('grep finds lines with path:lineNo and honours ignoreCase', async () => {
		const out = resultText(await callTool('grep', { pattern: 'needle' }));
		expect(out).toContain('src/b.txt:2:beta needle gamma');
		expect(out).not.toContain('alpha');
		const ci = resultText(await callTool('grep', { pattern: 'NEEDLE', ignoreCase: true }));
		expect(ci).toContain('src/b.txt:2:beta needle gamma');
	});

	it('grep rejects invalid regex', async () => {
		expect(isErr(await callTool('grep', { pattern: '(' }))).toBe(true);
	});

	it('glob matches relative paths', async () => {
		const res = await callTool('glob', { pattern: '**/*.md' });
		const matches = JSON.parse(resultText(res)) as string[];
		expect(matches).toContain('top.md');
		expect(matches).toContain('src/a.md');
	});

	it('rejects paths escaping the workspace', async () => {
		expect(isErr(await callTool('cat', { path: '../outside.txt' }))).toBe(true);
		expect(isErr(await callTool('ls', { path: '..' }))).toBe(true);
	});

	it('errors when no workspace is available', async () => {
		const res = await callTool('ls', {}, { ...ctx, workspaceDir: null });
		expect(isErr(res)).toBe(true);
		expect(resultText(res)).toContain('no workspace available');
	});
});
