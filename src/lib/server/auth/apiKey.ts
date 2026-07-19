import type { Db } from '../db/index.js';
import { resolveApiKey } from '../db/repo/api-keys.js';

export interface ApiKeyIdentity {
	keyId: string;
	userId: string;
	role: string;
	scopes: string[];
}

export async function resolveApiKeyIdentity(
	db: Db,
	authorizationHeader: string | null
): Promise<ApiKeyIdentity | null> {
	if (!authorizationHeader?.startsWith('Bearer ')) return null;
	const rawKey = authorizationHeader.slice('Bearer '.length).trim();
	if (!rawKey.startsWith('aic_')) return null;
	const row = await resolveApiKey(db, rawKey);
	if (!row) return null;
	const user = db.prepare('SELECT role FROM "user" WHERE id = ?').get(row.user_id) as
		{ role: string } | undefined;
	return {
		keyId: row.id,
		userId: row.user_id,
		role: user?.role ?? 'user',
		scopes: JSON.parse(row.scopes) as string[]
	};
}
