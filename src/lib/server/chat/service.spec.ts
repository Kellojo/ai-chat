import { describe, expect, it, vi } from 'vitest';

process.env.DATABASE_PATH = ':memory:';
process.env.APP_SECRET = 'test-secret-test-secret';

vi.mock('../llm/registry.js', async () => {
	const { MockLanguageModelV3 } = await import('ai/test');
	const { simulateReadableStream } = await import('ai');
	const model = new MockLanguageModelV3({
		doStream: async () => ({
			stream: simulateReadableStream({
				chunks: [
					{ type: 'text-start', id: 't1' },
					{ type: 'text-delta', id: 't1', delta: 'Hi ' },
					{ type: 'text-delta', id: 't1', delta: 'there' },
					{ type: 'text-end', id: 't1' },
					{
						type: 'finish',
						finishReason: 'stop',
						usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }
					} as never
				]
			})
		})
	});
	return {
		resolveModel: () => model,
		roleModel: () => undefined,
		ModelUnavailableError: class ModelUnavailableError extends Error {}
	};
});

const { getDb, closeDb } = await import('../db/index.js');
const { handleChatRequest } = await import('./service.js');
const { createConversation } = await import('../db/repo/conversations.js');
const { listMessages } = await import('../db/repo/messages.js');

type Db = ReturnType<typeof getDb>;

function seed(db: Db) {
	db.prepare(
		"INSERT INTO \"user\" (id, name, email, emailVerified, createdAt, updatedAt, role) VALUES ('u1', 'A', 'a@b.c', 0, 0, 0, 'user')"
	).run();
	const conversation = createConversation(db, 'u1', { providerId: 'p1', modelId: 'm1' });
	db.prepare("UPDATE conversations SET title = 't' WHERE id = ?").run(conversation.id);
	return conversation;
}

describe('handleChatRequest', () => {
	it('persists user and assistant messages with real ids', async () => {
		const db = getDb();
		const conversation = seed(db);

		const res = await handleChatRequest('u1', {
			conversationId: conversation.id,
			messages: [{ id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'hello' }] }]
		});
		expect(res.status).toBe(200);
		await res.text();
		await new Promise((r) => setTimeout(r, 50));

		const messages = listMessages(db, conversation.id);
		expect(messages).toHaveLength(2);
		const assistant = messages.find((m) => m.role === 'assistant')!;
		expect(assistant.id).toBeTruthy();
		expect(assistant.status).toBe('complete');
		expect(JSON.parse(assistant.parts)).toContainEqual(
			expect.objectContaining({ type: 'text', text: 'Hi there' })
		);
		closeDb();
	});

	it('persists assistant messages across multiple turns (no id collision)', async () => {
		const db = getDb();
		const conversation = seed(db);

		const first = await handleChatRequest('u1', {
			conversationId: conversation.id,
			messages: [{ id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'hello' }] }]
		});
		await first.text();
		await new Promise((r) => setTimeout(r, 50));
		const afterFirst = listMessages(db, conversation.id);
		const assistant1 = afterFirst.find((m) => m.role === 'assistant')!;

		const second = await handleChatRequest('u1', {
			conversationId: conversation.id,
			messages: [
				{ id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'hello' }] },
				{
					id: assistant1.id,
					role: 'assistant',
					parts: JSON.parse(assistant1.parts) as never[]
				},
				{ id: 'msg-2', role: 'user', parts: [{ type: 'text', text: 'again' }] }
			]
		});
		expect(second.status).toBe(200);
		await second.text();
		await new Promise((r) => setTimeout(r, 50));

		const messages = listMessages(db, conversation.id);
		expect(messages).toHaveLength(4);
		const assistants = messages.filter((m) => m.role === 'assistant');
		expect(new Set(assistants.map((m) => m.id)).size).toBe(2);
		closeDb();
	});
});
