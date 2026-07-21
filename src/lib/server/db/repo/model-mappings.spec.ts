import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from '../index.js';
import {
	createModelMapping,
	deleteModelMapping,
	getModelMappingByName,
	listEnabledModelMappings,
	listModelMappings,
	parseTargets,
	toPublic,
	updateModelMapping
} from './model-mappings.js';

let db: Db;

beforeEach(() => {
	db = openDatabase(':memory:');
});

describe('model-mappings repo', () => {
	it('creates, lists and resolves mappings by name', () => {
		const created = createModelMapping(db, {
			name: 'fast',
			targets: [
				{ providerId: 'p1', modelId: 'm1' },
				{ providerId: 'p2', modelId: 'm2' }
			]
		});
		expect(parseTargets(created)).toEqual([
			{ providerId: 'p1', modelId: 'm1' },
			{ providerId: 'p2', modelId: 'm2' }
		]);
		expect(getModelMappingByName(db, 'fast')!.id).toBe(created.id);
		expect(listModelMappings(db)).toHaveLength(1);
		expect(listEnabledModelMappings(db)).toHaveLength(1);
		expect(toPublic(created)).toEqual({
			id: created.id,
			name: 'fast',
			enabled: true,
			createdAt: created.created_at,
			targets: [
				{ providerId: 'p1', modelId: 'm1' },
				{ providerId: 'p2', modelId: 'm2' }
			]
		});
	});

	it('enforces unique names', () => {
		createModelMapping(db, { name: 'fast', targets: [{ providerId: 'p1', modelId: 'm1' }] });
		expect(() =>
			createModelMapping(db, { name: 'fast', targets: [{ providerId: 'p2', modelId: 'm2' }] })
		).toThrow();
	});

	it('updates name, targets and enabled', () => {
		const created = createModelMapping(db, {
			name: 'fast',
			targets: [{ providerId: 'p1', modelId: 'm1' }]
		});
		const updated = updateModelMapping(db, created.id, {
			name: 'faster',
			targets: [{ providerId: 'p2', modelId: 'm2' }],
			enabled: false
		})!;
		expect(updated.name).toBe('faster');
		expect(parseTargets(updated)).toEqual([{ providerId: 'p2', modelId: 'm2' }]);
		expect(listEnabledModelMappings(db)).toHaveLength(0);
		expect(updateModelMapping(db, 'missing', { name: 'x' })).toBeUndefined();
	});

	it('deletes mappings', () => {
		const created = createModelMapping(db, {
			name: 'fast',
			targets: [{ providerId: 'p1', modelId: 'm1' }]
		});
		expect(deleteModelMapping(db, created.id)).toBe(true);
		expect(deleteModelMapping(db, created.id)).toBe(false);
		expect(listModelMappings(db)).toHaveLength(0);
	});
});
