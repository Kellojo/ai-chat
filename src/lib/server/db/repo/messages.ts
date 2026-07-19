import { randomUUID } from 'node:crypto';
import type { Db } from '../index.js';

export interface MessageRow {
	id: string;
	conversation_id: string;
	role: string;
	parts: string;
	content_text: string;
	status: string;
	error: string | null;
	created_at: number;
}

export interface ChatMessage {
	id: string;
	conversationId: string;
	role: 'user' | 'assistant' | 'system';
	parts: unknown[];
	status: 'complete' | 'partial' | 'failed';
	error: string | null;
	createdAt: number;
}

export function toPublic(row: MessageRow): ChatMessage {
	return {
		id: row.id,
		conversationId: row.conversation_id,
		role: row.role as ChatMessage['role'],
		parts: JSON.parse(row.parts) as unknown[],
		status: row.status as ChatMessage['status'],
		error: row.error,
		createdAt: row.created_at
	};
}

export function extractText(parts: unknown[]): string {
	return parts
		.filter(
			(p): p is { type: 'text'; text: string } =>
				typeof p === 'object' && p !== null && (p as { type?: string }).type === 'text'
		)
		.map((p) => p.text)
		.join('\n');
}

export function listMessages(db: Db, conversationId: string): MessageRow[] {
	return db
		.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid')
		.all(conversationId) as MessageRow[];
}

export function getMessage(db: Db, id: string): MessageRow | undefined {
	return db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow | undefined;
}

export interface CreateMessageInput {
	id?: string;
	conversationId: string;
	role: 'user' | 'assistant' | 'system';
	parts: unknown[];
	status?: 'complete' | 'partial' | 'failed';
	error?: string | null;
	createdAt?: number;
}

export function createMessage(db: Db, input: CreateMessageInput): MessageRow {
	const id = input.id ?? randomUUID();
	db.prepare(
		`INSERT INTO messages (id, conversation_id, role, parts, content_text, status, error, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		id,
		input.conversationId,
		input.role,
		JSON.stringify(input.parts),
		extractText(input.parts),
		input.status ?? 'complete',
		input.error ?? null,
		input.createdAt ?? Date.now()
	);
	return getMessage(db, id)!;
}

export function updateMessage(
	db: Db,
	id: string,
	patch: { parts?: unknown[]; status?: 'complete' | 'partial' | 'failed'; error?: string | null }
): MessageRow | undefined {
	const existing = getMessage(db, id);
	if (!existing) return undefined;
	const parts = patch.parts !== undefined ? JSON.stringify(patch.parts) : existing.parts;
	db.prepare('UPDATE messages SET parts = ?, content_text = ?, status = ?, error = ? WHERE id = ?').run(
		parts,
		patch.parts !== undefined ? extractText(patch.parts) : existing.content_text,
		patch.status ?? existing.status,
		patch.error !== undefined ? patch.error : existing.error,
		id
	);
	return getMessage(db, id);
}

export function deleteMessage(db: Db, id: string): boolean {
	return db.prepare('DELETE FROM messages WHERE id = ?').run(id).changes > 0;
}

export function deleteMessagesNotIn(db: Db, conversationId: string, keepIds: string[]): number {
	if (keepIds.length === 0) {
		return db
			.prepare('DELETE FROM messages WHERE conversation_id = ?')
			.run(conversationId).changes;
	}
	const placeholders = keepIds.map(() => '?').join(', ');
	return db
		.prepare(`DELETE FROM messages WHERE conversation_id = ? AND id NOT IN (${placeholders})`)
		.run(conversationId, ...keepIds).changes;
}
