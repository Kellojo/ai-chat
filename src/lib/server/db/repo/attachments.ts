import { randomUUID } from 'node:crypto';
import type { Db } from '../index.js';

export interface AttachmentRow {
	id: string;
	message_id: string | null;
	kind: string;
	path: string;
	mime: string;
	sha256: string;
}

export function createAttachment(
	db: Db,
	input: { kind: string; path: string; mime: string; sha256: string }
): AttachmentRow {
	const id = randomUUID();
	db.prepare(
		'INSERT INTO attachments (id, message_id, kind, path, mime, sha256) VALUES (?, NULL, ?, ?, ?, ?)'
	).run(id, input.kind, input.path, input.mime, input.sha256);
	return getAttachment(db, id)!;
}

export function getAttachment(db: Db, id: string): AttachmentRow | undefined {
	return db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as
		| AttachmentRow
		| undefined;
}

export function linkAttachmentsToMessage(db: Db, messageId: string, ids: string[]): void {
	if (ids.length === 0) return;
	const placeholders = ids.map(() => '?').join(', ');
	db.prepare(
		`UPDATE attachments SET message_id = ? WHERE id IN (${placeholders}) AND message_id IS NULL`
	).run(messageId, ...ids);
}

export function listAttachmentsByConversation(db: Db, conversationId: string): AttachmentRow[] {
	return db
		.prepare(
			`SELECT a.* FROM attachments a
			 JOIN messages m ON m.id = a.message_id
			 WHERE m.conversation_id = ?`
		)
		.all(conversationId) as AttachmentRow[];
}
