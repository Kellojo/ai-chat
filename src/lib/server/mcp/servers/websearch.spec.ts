import http from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.resetModules();
process.env.DATABASE_PATH = ':memory:';
process.env.APP_SECRET = 'test-secret-test-secret';

const { createWebsearchServer } = await import('./websearch.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
const { createMCPClient } = await import('@ai-sdk/mcp');
const { getDb, closeDb } = await import('../../db/index.js');
const { setSetting, deleteSetting } = await import('../../db/repo/settings.js');

const SEARX_RESPONSE = {
	results: [
		{
			title: 'Svelte 5 released',
			url: 'https://svelte.dev/blog/svelte-5',
			content: 'Svelte 5 introduces runes.',
			publishedDate: '2024-10-22'
		},
		{
			title: 'SvelteKit docs',
			url: 'https://svelte.dev/docs/kit',
			content: 'SvelteKit is the application framework.'
		},
		{
			title: 'Long snippet',
			url: 'https://example.com/long',
			content: 'x'.repeat(500)
		}
	]
};

let httpServer: http.Server;
let base: string;
let lastQuery: URLSearchParams | null = null;

beforeAll(async () => {
	httpServer = http.createServer((req, res) => {
		const u = new URL(req.url ?? '/', 'http://x');
		lastQuery = u.searchParams;
		if (u.pathname === '/error/search') {
			res.writeHead(500).end('oops');
			return;
		}
		if (u.pathname === '/search') {
			res
				.writeHead(200, { 'content-type': 'application/json' })
				.end(JSON.stringify(SEARX_RESPONSE));
			return;
		}
		res.writeHead(404).end('not found');
	});
	await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
	const addr = httpServer.address();
	base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(async () => {
	await new Promise((resolve) => httpServer.close(resolve));
	closeDb();
});

beforeEach(() => {
	const db = getDb();
	deleteSetting(db, 'websearch.provider');
	deleteSetting(db, 'websearch.searxng.base_url');
	deleteSetting(db, 'websearch.default_limit');
	deleteSetting(db, 'websearch.timeout_ms');
	deleteSetting(db, 'websearch.safe_search');
	deleteSetting(db, 'websearch.language');
	setSetting(db, 'websearch.searxng.base_url', base);
	lastQuery = null;
});

async function callSearch(args: Record<string, unknown>) {
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const server = createWebsearchServer();
	await server.connect(serverTransport);
	const client = await createMCPClient({ transport: clientTransport, maxRetries: 0 });
	try {
		const tools = await client.tools();
		const tool = tools.web_search as unknown as {
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

describe('websearch server', () => {
	it('returns formatted results', async () => {
		const res = await callSearch({ query: 'svelte' });
		const out = resultText(res);
		expect((res as { isError?: boolean }).isError).not.toBe(true);
		expect(out).toContain('[Svelte 5 released](https://svelte.dev/blog/svelte-5)');
		expect(out).toContain('Svelte 5 introduces runes.');
		expect(out).toContain('(published 2024-10-22)');
		expect(out).toContain('[SvelteKit docs](https://svelte.dev/docs/kit)');
	});

	it('caps snippet length at 300 chars', async () => {
		const res = await callSearch({ query: 'long' });
		const out = resultText(res);
		expect(out).toContain('x'.repeat(300));
		expect(out).not.toContain('x'.repeat(301));
	});

	it('respects limit', async () => {
		const res = await callSearch({ query: 'svelte', limit: 1 });
		const out = resultText(res);
		expect(out).toContain('Svelte 5 released');
		expect(out).not.toContain('SvelteKit docs');
	});

	it('forwards categories, engines, time_range, safesearch, format=json', async () => {
		const db = getDb();
		setSetting(db, 'websearch.safe_search', 2);
		await callSearch({
			query: 'news',
			categories: ['news', 'general'],
			engines: ['duckduckgo'],
			time_range: 'week'
		});
		expect(lastQuery?.get('q')).toBe('news');
		expect(lastQuery?.get('format')).toBe('json');
		expect(lastQuery?.get('categories')).toBe('news,general');
		expect(lastQuery?.get('engines')).toBe('duckduckgo');
		expect(lastQuery?.get('time_range')).toBe('week');
		expect(lastQuery?.get('safesearch')).toBe('2');
	});

	it('forwards language when set (and omits when auto)', async () => {
		const db = getDb();
		await callSearch({ query: 'x' });
		expect(lastQuery?.get('language')).toBe(null);
		setSetting(db, 'websearch.language', 'de');
		await callSearch({ query: 'x' });
		expect(lastQuery?.get('language')).toBe('de');
	});

	it('uses default_limit when limit not given', async () => {
		const db = getDb();
		setSetting(db, 'websearch.default_limit', 2);
		const res = await callSearch({ query: 'x' });
		const out = resultText(res);
		expect(out).toContain('Svelte 5 released');
		expect(out).toContain('SvelteKit docs');
		expect(out).not.toContain('Long snippet');
	});

	it('returns friendly error when base URL not configured', async () => {
		const db = getDb();
		deleteSetting(db, 'websearch.searxng.base_url');
		const res = await callSearch({ query: 'x' });
		expect((res as { isError?: boolean }).isError).toBe(true);
		expect(resultText(res)).toContain('not configured');
	});

	it('reports HTTP error status', async () => {
		const db = getDb();
		setSetting(db, 'websearch.searxng.base_url', `${base}/error`);
		const res = await callSearch({ query: 'x' });
		expect((res as { isError?: boolean }).isError).toBe(true);
		expect(resultText(res)).toContain('HTTP 500');
	});

	it('reports network failure', async () => {
		const db = getDb();
		setSetting(db, 'websearch.searxng.base_url', 'http://127.0.0.1:1');
		const res = await callSearch({ query: 'x' });
		expect((res as { isError?: boolean }).isError).toBe(true);
		expect(resultText(res)).toContain('web search failed');
	});
});
