import { randomUUID } from 'node:crypto';
import type { Db } from '../index.js';

export interface ConversationRow {
	id: string;
	user_id: string;
	kind: string;
	title: string;
	mode: string;
	provider_id: string | null;
	model_id: string | null;
	system_prompt: string | null;
	memory_enabled: number;
	max_steps: number | null;
	temperature: number | null;
	max_tokens: number | null;
	pinned: number;
	created_at: number;
	updated_at: number;
	deleted_at: number | null;
}

export interface Conversation {
	id: string;
	kind: 'chat' | 'agent-run' | 'research';
	title: string;
	mode: 'chat' | 'agent';
	providerId: string | null;
	modelId: string | null;
	systemPrompt: string | null;
	memoryEnabled: boolean;
	maxSteps: number | null;
	temperature: number | null;
	maxTokens: number | null;
	pinned: boolean;
	createdAt: number;
	updatedAt: number;
}

export function toPublic(row: ConversationRow): Conversation {
	return {
		id: row.id,
		kind: row.kind as Conversation['kind'],
		title: row.title,
		mode: row.mode as Conversation['mode'],
		providerId: row.provider_id,
		modelId: row.model_id,
		systemPrompt: row.system_prompt,
		memoryEnabled: row.memory_enabled === 1,
		maxSteps: row.max_steps,
		temperature: row.temperature,
		maxTokens: row.max_tokens,
		pinned: row.pinned === 1,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

export function listConversations(db: Db, userId: string): ConversationRow[] {
	return db
		.prepare(
			`SELECT * FROM conversations
			 WHERE user_id = ? AND kind = 'chat' AND deleted_at IS NULL
			 ORDER BY pinned DESC, updated_at DESC`
		)
		.all(userId) as ConversationRow[];
}

export function getConversation(
	db: Db,
	userId: string,
	id: string
): ConversationRow | undefined {
	return db
		.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
		.get(id, userId) as ConversationRow | undefined;
}

export interface CreateConversationInput {
	providerId?: string | null;
	modelId?: string | null;
	mode?: 'chat' | 'agent';
	kind?: 'chat' | 'agent-run' | 'research';
	title?: string;
}

export function createConversation(
	db: Db,
	userId: string,
	input: CreateConversationInput = {}
): ConversationRow {
	const id = randomUUID();
	const now = Date.now();
	db.prepare(
		`INSERT INTO conversations (id, user_id, kind, title, mode, provider_id, model_id, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		id,
		userId,
		input.kind ?? 'chat',
		input.title ?? '',
		input.mode ?? 'chat',
		input.providerId ?? null,
		input.modelId ?? null,
		now,
		now
	);
	return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as ConversationRow;
}

export interface UpdateConversationInput {
	title?: string;
	mode?: 'chat' | 'agent';
	providerId?: string | null;
	modelId?: string | null;
	systemPrompt?: string | null;
	memoryEnabled?: boolean;
	maxSteps?: number | null;
	temperature?: number | null;
	maxTokens?: number | null;
}

export function updateConversation(
	db: Db,
	userId: string,
	id: string,
	patch: UpdateConversationInput
): ConversationRow | undefined {
	const existing = getConversation(db, userId, id);
	if (!existing) return undefined;
	db.prepare(
		`UPDATE conversations SET title = ?, mode = ?, provider_id = ?, model_id = ?,
		 system_prompt = ?, memory_enabled = ?, max_steps = ?, temperature = ?, max_tokens = ?, updated_at = ?
		 WHERE id = ?`
	).run(
		patch.title ?? existing.title,
		patch.mode ?? existing.mode,
		patch.providerId !== undefined ? patch.providerId : existing.provider_id,
		patch.modelId !== undefined ? patch.modelId : existing.model_id,
		patch.systemPrompt !== undefined ? patch.systemPrompt : existing.system_prompt,
		patch.memoryEnabled !== undefined ? (patch.memoryEnabled ? 1 : 0) : existing.memory_enabled,
		patch.maxSteps !== undefined ? patch.maxSteps : existing.max_steps,
		patch.temperature !== undefined ? patch.temperature : existing.temperature,
		patch.maxTokens !== undefined ? patch.maxTokens : existing.max_tokens,
		Date.now(),
		id
	);
	return getConversation(db, userId, id);
}

export function touchConversation(db: Db, id: string): void {
	db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(Date.now(), id);
}

export function setConversationTitle(db: Db, id: string, title: string): void {
	db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(
		title,
		Date.now(),
		id
	);
}

export function softDeleteConversation(db: Db, userId: string, id: string): boolean {
	return (
		db
			.prepare(
				'UPDATE conversations SET deleted_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
			)
			.run(Date.now(), id, userId).changes > 0
	);
}

export function togglePin(db: Db, userId: string, id: string): ConversationRow | undefined {
	const existing = getConversation(db, userId, id);
	if (!existing) return undefined;
	db.prepare('UPDATE conversations SET pinned = ? WHERE id = ?').run(
		existing.pinned === 1 ? 0 : 1,
		id
	);
	return getConversation(db, userId, id);
}

export function searchConversations(db: Db, userId: string, query: string): ConversationRow[] {
	const ftsQuery = query
		.split(/\s+/)
		.filter(Boolean)
		.map((term) => `"${term.replace(/"/g, '""')}"*`)
		.join(' AND ');
	if (!ftsQuery) return [];
	return db
		.prepare(
			`SELECT DISTINCT c.* FROM conversations c
			 LEFT JOIN messages_fts f ON f.conversation_id = c.id AND messages_fts MATCH ?
			 WHERE c.user_id = ? AND c.kind = 'chat' AND c.deleted_at IS NULL
			   AND (c.title LIKE ? OR f.conversation_id IS NOT NULL)
			 ORDER BY c.pinned DESC, c.updated_at DESC`
		)
		.all(ftsQuery, userId, `%${query}%`) as ConversationRow[];
}
