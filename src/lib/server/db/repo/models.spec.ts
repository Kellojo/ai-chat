import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from '../index.js';
import { createProvider } from './providers.js';
import {
	createModel,
	findRoleModel,
	listEnabledModels,
	listRoleDefaults,
	setRoleDefault,
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

	it('setRoleDefault assigns one model per role and allows reuse across roles', () => {
		const m1 = createModel(db, { providerId, modelId: 'one' });
		const m2 = createModel(db, { providerId, modelId: 'two' });
		setRoleDefault(db, 'chat', m1.id);
		setRoleDefault(db, 'chat', m2.id);
		expect(findRoleModel(db, 'chat')!.id).toBe(m2.id);
		setRoleDefault(db, 'memory', m2.id);
		expect(findRoleModel(db, 'memory')!.id).toBe(m2.id);
		expect(listRoleDefaults(db)).toEqual({ chat: m2.id, memory: m2.id });
		setRoleDefault(db, 'chat', null);
		expect(findRoleModel(db, 'chat')).toBeUndefined();
		expect(findRoleModel(db, 'memory')!.id).toBe(m2.id);
	});

	it('role + enabled lookups skip disabled models and providers', () => {
		const m = createModel(db, { providerId, modelId: 'one' });
		setRoleDefault(db, 'memory', m.id);
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
