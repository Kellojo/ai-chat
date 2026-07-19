import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from '../index.js';
import { createProvider } from './providers.js';
import {
	createModel,
	findRoleModel,
	listEnabledModels,
	setModelRole,
	upsertFetchedModels
} from './models.js';

let db: Db;
let providerId: string;

beforeEach(() => {
	db = openDatabase(':memory:');
	providerId = createProvider(db, { name: 'P', type: 'anthropic' }).id;
});

describe('models repo', () => {
	it('upsertFetchedModels inserts only missing models', () => {
		expect(upsertFetchedModels(db, providerId, ['a', 'b'])).toEqual({ added: 2, total: 2 });
		expect(upsertFetchedModels(db, providerId, ['b', 'c'])).toEqual({ added: 1, total: 2 });
	});

	it('setModelRole makes the role exclusive', () => {
		const m1 = createModel(db, { providerId, modelId: 'one' });
		const m2 = createModel(db, { providerId, modelId: 'two' });
		setModelRole(db, m1.id, 'chat');
		setModelRole(db, m2.id, 'chat');
		expect(findRoleModel(db, 'chat')!.id).toBe(m2.id);
		setModelRole(db, m2.id, null);
		expect(findRoleModel(db, 'chat')).toBeUndefined();
	});

	it('role + enabled lookups skip disabled models and providers', () => {
		const m = createModel(db, { providerId, modelId: 'one' });
		setModelRole(db, m.id, 'memory');
		expect(findRoleModel(db, 'memory')!.id).toBe(m.id);

		db.prepare('UPDATE models SET enabled = 0 WHERE id = ?').run(m.id);
		expect(findRoleModel(db, 'memory')).toBeUndefined();
		expect(listEnabledModels(db)).toHaveLength(0);

		db.prepare('UPDATE models SET enabled = 1 WHERE id = ?').run(m.id);
		db.prepare('UPDATE providers SET enabled = 0 WHERE id = ?').run(providerId);
		expect(findRoleModel(db, 'memory')).toBeUndefined();
		expect(listEnabledModels(db)).toHaveLength(0);
	});
});
