import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.resetModules();
process.env.DATABASE_PATH = ':memory:';
process.env.APP_SECRET = 'test-secret-test-secret';

const { openDatabase } = await import('../index.js');
const repo = await import('./user-settings.js');

function seedUser(db: ReturnType<typeof openDatabase>, id: string) {
	db.prepare(
		'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt, role) VALUES (?, ?, ?, 0, 0, 0, \'user\')'
	).run(id, 'A', `${id}@example.com`);
}

describe('user-settings repo', () => {
	let db: ReturnType<typeof openDatabase>;

	beforeEach(() => {
		db = openDatabase(':memory:');
		seedUser(db, 'u1');
	});

	it('returns defaults when nothing is stored', () => {
		expect(repo.getUserSettings(db, 'u1')).toEqual({
			theme: 'system',
			suggestions: repo.getSuggestions(db, 'u1')
		});
		expect(repo.getTheme(db, 'u1')).toBe('system');
		expect(repo.getSuggestions(db, 'u1').length).toBeGreaterThan(0);
	});

	it('round-trips values per user', () => {
		repo.setUserSetting(db, 'u1', 'theme', 'dark');
		repo.setUserSetting(db, 'u1', 'suggestions', ['one', 'two']);
		expect(repo.getTheme(db, 'u1')).toBe('dark');
		expect(repo.getSuggestions(db, 'u1')).toEqual(['one', 'two']);
		seedUser(db, 'u2');
		expect(repo.getTheme(db, 'u2')).toBe('system');
	});

	it('overwrites existing values', () => {
		repo.setUserSetting(db, 'u1', 'theme', 'dark');
		repo.setUserSetting(db, 'u1', 'theme', 'light');
		expect(repo.getTheme(db, 'u1')).toBe('light');
	});

	it('falls back to defaults for invalid stored data', () => {
		db.prepare('INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)').run(
			'u1',
			'theme',
			JSON.stringify('neon')
		);
		db.prepare('INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)').run(
			'u1',
			'suggestions',
			JSON.stringify('not-an-array')
		);
		expect(repo.getTheme(db, 'u1')).toBe('system');
		expect(repo.getSuggestions(db, 'u1').length).toBeGreaterThan(0);
	});

	it('cascades on user delete', () => {
		repo.setUserSetting(db, 'u1', 'theme', 'dark');
		db.prepare('DELETE FROM "user" WHERE id = ?').run('u1');
		expect(repo.getTheme(db, 'u1')).toBe('system');
	});
});
