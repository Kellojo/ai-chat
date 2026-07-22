import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from '../index.js';
import {
	createConversation,
	getConversation,
	listConversations,
	searchConversations,
	softDeleteConversation,
	togglePin,
	updateConversation
} from './conversations.js';
import { createMessage } from './messages.js';

let db: Db;

beforeEach(() => {
	db = openDatabase(':memory:');
	db.prepare(
		'INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt", role) VALUES (\'u1\', \'a@b.c\', \'A\', 0, 0, 0, \'user\')'
	).run();
	db.prepare(
		'INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt", role) VALUES (\'u2\', \'d@e.f\', \'D\', 0, 0, 0, \'user\')'
	).run();
});

describe('conversations repo', () => {
	it('lists only own, non-deleted chat conversations, pinned first', () => {
		const a = createConversation(db, 'u1', { title: 'a' });
		const b = createConversation(db, 'u1', { title: 'b' });
		createConversation(db, 'u2', { title: 'other user' });
		createConversation(db, 'u1', { title: 'run', kind: 'agent-run' });
		togglePin(db, 'u1', b.id);
		const list = listConversations(db, 'u1');
		expect(list.map((c) => c.id)).toEqual([b.id, a.id]);
		softDeleteConversation(db, 'u1', a.id);
		expect(listConversations(db, 'u1').map((c) => c.id)).toEqual([b.id]);
	});

	it('getConversation enforces ownership', () => {
		const c = createConversation(db, 'u1');
		expect(getConversation(db, 'u1', c.id)).toBeDefined();
		expect(getConversation(db, 'u2', c.id)).toBeUndefined();
	});

	it('updateConversation patches fields', () => {
		const c = createConversation(db, 'u1');
		const updated = updateConversation(db, 'u1', c.id, {
			title: 'new',
			mode: 'agent',
			memoryEnabled: true,
			maxSteps: 10
		});
		expect(updated!.title).toBe('new');
		expect(updated!.mode).toBe('agent');
		expect(updated!.memory_enabled).toBe(1);
		expect(updated!.max_steps).toBe(10);
	});

	it('searchConversations matches title and message content (FTS)', () => {
		const byTitle = createConversation(db, 'u1', { title: 'quarterly budget' });
		const byContent = createConversation(db, 'u1', { title: 'random' });
		createMessage(db, {
			conversationId: byContent.id,
			role: 'user',
			parts: [{ type: 'text', text: 'tell me about the quarterly budget' }]
		});
		createConversation(db, 'u1', { title: 'unrelated' });
		const hits = searchConversations(db, 'u1', 'quarterly');
		expect(new Set(hits.map((c) => c.id))).toEqual(new Set([byTitle.id, byContent.id]));
	});

	it('pages with limit and offset', () => {
		const ids = Array.from({ length: 5 }, (_, i) => {
			const c = createConversation(db, 'u1', { title: `c${i}` });
			db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(1000 + i, c.id);
			return c.id;
		});
		const page1 = listConversations(db, 'u1', { limit: 2 });
		expect(page1.map((c) => c.id)).toEqual([ids[4], ids[3]]);
		const page2 = listConversations(db, 'u1', { limit: 2, offset: 2 });
		expect(page2.map((c) => c.id)).toEqual([ids[2], ids[1]]);
		const page3 = listConversations(db, 'u1', { limit: 2, offset: 4 });
		expect(page3.map((c) => c.id)).toEqual([ids[0]]);
	});
});
