import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from '../index.js';
import { createConversation } from './conversations.js';
import {
	createMessage,
	deleteMessagesNotIn,
	extractText,
	listMessages,
	toPublic,
	updateMessage
} from './messages.js';

let db: Db;
let conversationId: string;

beforeEach(() => {
	db = openDatabase(':memory:');
	db.prepare(
		'INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt", role) VALUES (\'u1\', \'a@b.c\', \'A\', 0, 0, 0, \'user\')'
	).run();
	conversationId = createConversation(db, 'u1').id;
});

describe('messages repo', () => {
	it('createMessage extracts searchable text from parts', () => {
		const m = createMessage(db, {
			conversationId,
			role: 'user',
			parts: [
				{ type: 'text', text: 'hello' },
				{ type: 'file', url: 'x' },
				{ type: 'text', text: 'world' }
			]
		});
		expect(m.content_text).toBe('hello\nworld');
		expect(toPublic(m).parts).toHaveLength(3);
	});

	it('deleteMessagesNotIn removes only unlisted messages of the conversation', () => {
		const keep = createMessage(db, { conversationId, role: 'user', parts: [] });
		const drop = createMessage(db, { conversationId, role: 'assistant', parts: [] });
		const otherConv = createConversation(db, 'u1');
		const other = createMessage(db, { conversationId: otherConv.id, role: 'user', parts: [] });
		expect(deleteMessagesNotIn(db, conversationId, [keep.id])).toBe(1);
		const remaining = listMessages(db, conversationId).map((m) => m.id);
		expect(remaining).toEqual([keep.id]);
		expect(listMessages(db, otherConv.id).map((m) => m.id)).toEqual([other.id]);
		expect(drop.id).not.toBe(keep.id);
	});

	it('updateMessage patches parts, status, and error', () => {
		const m = createMessage(db, { conversationId, role: 'assistant', parts: [] });
		const updated = updateMessage(db, m.id, {
			parts: [{ type: 'text', text: 'partial answer' }],
			status: 'partial',
			error: 'aborted'
		});
		expect(updated!.status).toBe('partial');
		expect(updated!.error).toBe('aborted');
		expect(updated!.content_text).toBe('partial answer');
	});

	it('extractText joins only text parts', () => {
		expect(
			extractText([
				{ type: 'reasoning', text: 'skip' },
				{ type: 'text', text: 'a' },
				{ type: 'text', text: 'b' }
			])
		).toBe('a\nb');
	});
});
