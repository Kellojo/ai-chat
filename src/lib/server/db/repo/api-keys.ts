import { randomBytes, randomUUID } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import type { ApiKey } from '$lib/types.js';
import type { Db } from '../index.js';

export interface ApiKeyRow {
	id: string;
	user_id: string;
	label: string;
	hash: string;
	scopes: string;
	created_at: number;
	last_used_at: number | null;
}

export function toPublic(row: ApiKeyRow): ApiKey {
	return {
		id: row.id,
		label: row.label,
		scopes: JSON.parse(row.scopes) as string[],
		createdAt: row.created_at,
		lastUsedAt: row.last_used_at
	};
}

export interface CreateApiKeyInput {
	userId: string;
	label: string;
	scopes?: string[];
}

export async function createApiKey(
	db: Db,
	input: CreateApiKeyInput
): Promise<{ row: ApiKeyRow; rawKey: string }> {
	const id = randomUUID();
	const rawKey = `aic_${id}_${randomBytes(24).toString('base64url')}`;
	const keyHash = await hash(rawKey);
	db.prepare(
		'INSERT INTO api_keys (id, user_id, label, hash, scopes, created_at) VALUES (?, ?, ?, ?, ?, ?)'
	).run(
		id,
		input.userId,
		input.label,
		keyHash,
		JSON.stringify(input.scopes ?? ['agents:run']),
		Date.now()
	);
	return { row: getApiKey(db, id)!, rawKey };
}

export function getApiKey(db: Db, id: string): ApiKeyRow | undefined {
	return db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id) as ApiKeyRow | undefined;
}

export function listApiKeys(db: Db, userId: string): ApiKeyRow[] {
	return db
		.prepare('SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC')
		.all(userId) as ApiKeyRow[];
}

export function deleteApiKey(db: Db, id: string, userId: string): boolean {
	return (
		db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').run(id, userId).changes > 0
	);
}

export async function resolveApiKey(db: Db, rawKey: string): Promise<ApiKeyRow | null> {
	if (!rawKey.startsWith('aic_')) return null;
	const rest = rawKey.slice(4);
	const sep = rest.indexOf('_');
	if (sep <= 0 || sep === rest.length - 1) return null;
	const row = getApiKey(db, rest.slice(0, sep));
	if (!row) return null;
	try {
		if (!(await verify(row.hash, rawKey))) return null;
	} catch {
		return null;
	}
	db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(Date.now(), row.id);
	return getApiKey(db, row.id)!;
}
