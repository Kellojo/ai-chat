import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from '../index.js';
import { createApiKey, deleteApiKey, listApiKeys, resolveApiKey, toPublic } from './api-keys.js';

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

describe('api-keys repo', () => {
	it('createApiKey returns a raw aic_ key and stores a hash', async () => {
		const { row, rawKey } = await createApiKey(db, { userId: 'u1', label: 'ci' });
		expect(rawKey.startsWith(`aic_${row.id}_`)).toBe(true);
		expect(row.hash).not.toBe(rawKey);
		expect(toPublic(row).scopes).toEqual(['agents:run']);
	});

	it('resolveApiKey round-trips and updates last_used_at', async () => {
		const { row, rawKey } = await createApiKey(db, { userId: 'u1', label: 'ci' });
		const resolved = await resolveApiKey(db, rawKey);
		expect(resolved!.id).toBe(row.id);
		expect(resolved!.user_id).toBe('u1');
		expect(resolved!.last_used_at).not.toBeNull();
	});

	it('resolveApiKey rejects wrong secrets and garbage', async () => {
		const { rawKey } = await createApiKey(db, { userId: 'u1', label: 'ci' });
		const wrong = `${rawKey.slice(0, rawKey.lastIndexOf('_'))}_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
		expect(await resolveApiKey(db, wrong)).toBeNull();
		expect(await resolveApiKey(db, 'not-a-key')).toBeNull();
		expect(await resolveApiKey(db, 'aic_missing_secret')).toBeNull();
		expect(await resolveApiKey(db, '')).toBeNull();
	});

	it('listApiKeys is scoped to the user', async () => {
		await createApiKey(db, { userId: 'u1', label: 'one' });
		await createApiKey(db, { userId: 'u2', label: 'two' });
		expect(listApiKeys(db, 'u1').map((k) => k.label)).toEqual(['one']);
	});

	it('deleteApiKey is scoped to the user', async () => {
		const { row } = await createApiKey(db, { userId: 'u1', label: 'ci' });
		expect(deleteApiKey(db, row.id, 'u2')).toBe(false);
		expect(deleteApiKey(db, row.id, 'u1')).toBe(true);
		expect(listApiKeys(db, 'u1')).toHaveLength(0);
	});
});
