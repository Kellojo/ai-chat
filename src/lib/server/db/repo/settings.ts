import type { Db } from '../index.js';

interface SettingRow {
	key: string;
	value: string;
}

export function getSetting<T>(db: Db, key: string): T | undefined {
	const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
		Pick<SettingRow, 'value'> | undefined;
	if (!row) return undefined;
	return JSON.parse(row.value) as T;
}

export function getAllSettings(db: Db): Record<string, unknown> {
	const rows = db.prepare('SELECT key, value FROM settings ORDER BY key').all() as SettingRow[];
	return Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
}

export function setSetting(db: Db, key: string, value: unknown): void {
	db.prepare(
		'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
	).run(key, JSON.stringify(value));
}

export function deleteSetting(db: Db, key: string): boolean {
	return db.prepare('DELETE FROM settings WHERE key = ?').run(key).changes > 0;
}
