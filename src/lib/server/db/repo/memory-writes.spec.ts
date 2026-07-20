import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.resetModules();
process.env.DATABASE_PATH = ':memory:';
process.env.APP_SECRET = 'test-secret-test-secret';

const { openDatabase } = await import('../index.js');
const repo = await import('./memory-writes.js');

describe('memory-writes repo', () => {
	let db: ReturnType<typeof openDatabase>;

	beforeEach(() => {
		db = openDatabase(':memory:');
	});

	it('records a write and returns the row', () => {
		const row = repo.recordMemoryWrite(db, {
			userId: 'u1',
			conceptPath: 'people/john.md',
			action: 'create',
			author: 'user:u1',
			diff: '--- a\n+++ b\n'
		});
		expect(row.id).toBeTruthy();
		expect(row.user_id).toBe('u1');
		expect(row.concept_path).toBe('people/john.md');
		expect(row.action).toBe('create');
		expect(row.author).toBe('user:u1');
		expect(row.diff).toBe('--- a\n+++ b\n');
		expect(row.conversation_id).toBeNull();
		expect(row.agent_run_id).toBeNull();
		expect(typeof row.created_at).toBe('number');
	});

	it('stores optional conversation and agent run ids', () => {
		const row = repo.recordMemoryWrite(db, {
			userId: 'u1',
			conversationId: 'c1',
			agentRunId: 'r1',
			conceptPath: 'a.md',
			action: 'update',
			author: 'agent:a1'
		});
		expect(row.conversation_id).toBe('c1');
		expect(row.agent_run_id).toBe('r1');
		expect(row.diff).toBeNull();
	});

	it('filters by userId', () => {
		repo.recordMemoryWrite(db, {
			userId: 'u1',
			conceptPath: 'a.md',
			action: 'create',
			author: 'user:u1'
		});
		repo.recordMemoryWrite(db, {
			userId: 'u2',
			conceptPath: 'b.md',
			action: 'create',
			author: 'user:u2'
		});
		const rows = repo.listMemoryWrites(db, { userId: 'u1' });
		expect(rows).toHaveLength(1);
		expect(rows[0].user_id).toBe('u1');
	});

	it('filters by conceptPath', () => {
		repo.recordMemoryWrite(db, {
			userId: 'u1',
			conceptPath: 'a.md',
			action: 'create',
			author: 'user:u1'
		});
		repo.recordMemoryWrite(db, {
			userId: 'u1',
			conceptPath: 'b.md',
			action: 'create',
			author: 'user:u1'
		});
		const rows = repo.listMemoryWrites(db, { conceptPath: 'a.md' });
		expect(rows).toHaveLength(1);
		expect(rows[0].concept_path).toBe('a.md');
	});

	it('combines filters and respects limit', () => {
		for (let i = 0; i < 5; i++) {
			repo.recordMemoryWrite(db, {
				userId: 'u1',
				conceptPath: 'a.md',
				action: 'update',
				author: 'user:u1'
			});
		}
		repo.recordMemoryWrite(db, {
			userId: 'u2',
			conceptPath: 'a.md',
			action: 'create',
			author: 'user:u2'
		});
		expect(repo.listMemoryWrites(db, { userId: 'u1', conceptPath: 'a.md' })).toHaveLength(5);
		expect(repo.listMemoryWrites(db, { userId: 'u1', limit: 2 })).toHaveLength(2);
	});

	it('orders by created_at DESC with id tiebreak', () => {
		db.prepare(
			`INSERT INTO memory_writes (id, user_id, concept_path, action, author, created_at)
			 VALUES ('a', 'u1', 'a.md', 'create', 'user:u1', 1000),
			        ('b', 'u1', 'a.md', 'update', 'user:u1', 1000),
			        ('c', 'u1', 'a.md', 'delete', 'user:u1', 500)`
		).run();
		const rows = repo.listMemoryWrites(db, {});
		expect(rows.map((r) => r.id)).toEqual(['b', 'a', 'c']);
	});
});
