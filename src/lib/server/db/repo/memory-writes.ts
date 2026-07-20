import { randomUUID } from 'node:crypto';
import type { Db } from '../index.js';

export type MemoryWriteAction = 'create' | 'update' | 'delete';

export interface MemoryWriteRow {
	id: string;
	user_id: string;
	conversation_id: string | null;
	agent_run_id: string | null;
	concept_path: string;
	action: string;
	author: string;
	diff: string | null;
	created_at: number;
}

export interface RecordMemoryWriteInput {
	userId: string;
	conversationId?: string | null;
	agentRunId?: string | null;
	conceptPath: string;
	action: MemoryWriteAction;
	author: string;
	diff?: string | null;
}

export function recordMemoryWrite(db: Db, input: RecordMemoryWriteInput): MemoryWriteRow {
	const id = randomUUID();
	db.prepare(
		`INSERT INTO memory_writes (id, user_id, conversation_id, agent_run_id, concept_path, action, author, diff, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		id,
		input.userId,
		input.conversationId ?? null,
		input.agentRunId ?? null,
		input.conceptPath,
		input.action,
		input.author,
		input.diff ?? null,
		Date.now()
	);
	return db.prepare('SELECT * FROM memory_writes WHERE id = ?').get(id) as MemoryWriteRow;
}

export function getMemoryWrite(db: Db, id: string): MemoryWriteRow | undefined {
	return db.prepare('SELECT * FROM memory_writes WHERE id = ?').get(id) as
		MemoryWriteRow | undefined;
}

export function listMemoryWrites(
	db: Db,
	opts: { userId?: string; conceptPath?: string; scope?: 'user' | 'shared'; limit?: number }
): MemoryWriteRow[] {
	const where: string[] = [];
	const params: unknown[] = [];
	if (opts.userId !== undefined) {
		where.push('user_id = ?');
		params.push(opts.userId);
	}
	if (opts.conceptPath !== undefined) {
		where.push('concept_path = ?');
		params.push(opts.conceptPath);
	}
	if (opts.scope === 'shared') {
		where.push(`concept_path LIKE 'shared/%'`);
	} else if (opts.scope === 'user') {
		where.push(`concept_path NOT LIKE 'shared/%'`);
	}
	const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
	const sql = `SELECT * FROM memory_writes
		${where.length ? `WHERE ${where.join(' AND ')}` : ''}
		ORDER BY created_at DESC, id DESC LIMIT ?`;
	return db.prepare(sql).all(...params, limit) as MemoryWriteRow[];
}
