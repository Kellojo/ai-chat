import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.resetModules();
process.env.DATABASE_PATH = ':memory:';
process.env.APP_SECRET = 'test-secret-test-secret';

const { createChatSearchServer } = await import('./chat-search.js');
const { getDb } = await import('../../db/index.js');
const { createConversation } = await import('../../db/repo/conversations.js');
const { createMessage } = await import('../../db/repo/messages.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
const { createMCPClient } = await import('@ai-sdk/mcp');

const ctx = { userId: 'u1', role: 'user', workspaceDir: null, documentsDir: '' };

let ownId: string;
let ownByMessageId: string;
let otherId: string;

beforeAll(() => {
	const db = getDb();
	db.prepare(
		'INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt", role) VALUES (\'u1\', \'a@b.c\', \'A\', 0, 0, 0, \'user\')'
	).run();
	db.prepare(
		'INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt", role) VALUES (\'u2\', \'d@e.f\', \'D\', 0, 0, 0, \'user\')'
	).run();
	ownId = createConversation(db, 'u1', { title: 'quarterly budget' }).id;
	ownByMessageId = createConversation(db, 'u1', { title: 'random title' }).id;
	createMessage(db, {
		conversationId: ownByMessageId,
		role: 'user',
		parts: [{ type: 'text', text: 'tell me about the quarterly report' }]
	});
	otherId = createConversation(db, 'u2', { title: 'quarterly budget' }).id;
});

async function callSearch(args: Record<string, unknown>) {
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const server = createChatSearchServer(ctx);
	await server.connect(serverTransport);
	const client = await createMCPClient({ transport: clientTransport, maxRetries: 0 });
	try {
		const tools = await client.tools();
		const tool = tools.search_chats as unknown as {
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

describe('chat-search server', () => {
	it("finds own conversations by title and message content, not other users'", async () => {
		const res = await callSearch({ query: 'quarterly' });
		const hits = JSON.parse(resultText(res)) as Array<{
			id: string;
			title: string;
			updatedAt: number;
		}>;
		const ids = new Set(hits.map((h) => h.id));
		expect(ids.has(ownId)).toBe(true);
		expect(ids.has(ownByMessageId)).toBe(true);
		expect(ids.has(otherId)).toBe(false);
		for (const h of hits) {
			expect(typeof h.title).toBe('string');
			expect(typeof h.updatedAt).toBe('number');
		}
	});

	it('honours the limit argument', async () => {
		const res = await callSearch({ query: 'quarterly', limit: 1 });
		const hits = JSON.parse(resultText(res)) as unknown[];
		expect(hits).toHaveLength(1);
	});

	it('rejects an empty query', async () => {
		const res = await callSearch({ query: '   ' });
		expect((res as { isError?: boolean }).isError).toBe(true);
	});
});
