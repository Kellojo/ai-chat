import type { Db } from '../index.js';
import {
	DEFAULT_USER_SETTINGS,
	THEMES,
	TIME_FORMATS,
	type Theme,
	type TimeFormat,
	type UserSettings
} from '$lib/user-settings.js';

interface UserSettingRow {
	key: string;
	value: string;
}

export function getUserSetting<T>(db: Db, userId: string, key: string): T | undefined {
	const row = db
		.prepare('SELECT value FROM user_settings WHERE user_id = ? AND key = ?')
		.get(userId, key) as Pick<UserSettingRow, 'value'> | undefined;
	if (!row) return undefined;
	return JSON.parse(row.value) as T;
}

export function setUserSetting(db: Db, userId: string, key: string, value: unknown): void {
	db.prepare(
		`INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
		 ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`
	).run(userId, key, JSON.stringify(value));
}

export function deleteUserSetting(db: Db, userId: string, key: string): void {
	db.prepare('DELETE FROM user_settings WHERE user_id = ? AND key = ?').run(userId, key);
}

export function getTheme(db: Db, userId: string): Theme {
	const theme = getUserSetting<string>(db, userId, 'theme');
	return THEMES.includes(theme as Theme) ? (theme as Theme) : DEFAULT_USER_SETTINGS.theme;
}

export function getSuggestions(db: Db, userId: string): string[] {
	const suggestions = getUserSetting<string[]>(db, userId, 'suggestions');
	if (!Array.isArray(suggestions)) return DEFAULT_USER_SETTINGS.suggestions;
	return suggestions.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
}

export function getGlobalInstructions(db: Db, userId: string): string {
	const value = getUserSetting<string>(db, userId, 'globalInstructions');
	if (typeof value !== 'string') return DEFAULT_USER_SETTINGS.globalInstructions;
	return value.trim();
}

export function getTimeFormat(db: Db, userId: string): TimeFormat {
	const value = getUserSetting<string>(db, userId, 'timeFormat');
	return TIME_FORMATS.includes(value as TimeFormat)
		? (value as TimeFormat)
		: DEFAULT_USER_SETTINGS.timeFormat;
}

export function getSidebarOpen(db: Db, userId: string): boolean {
	const value = getUserSetting<boolean>(db, userId, 'sidebarOpen');
	return typeof value === 'boolean' ? value : DEFAULT_USER_SETTINGS.sidebarOpen;
}

export function getUserSettings(db: Db, userId: string): UserSettings {
	return {
		theme: getTheme(db, userId),
		suggestions: getSuggestions(db, userId),
		globalInstructions: getGlobalInstructions(db, userId),
		timeFormat: getTimeFormat(db, userId),
		sidebarOpen: getSidebarOpen(db, userId)
	};
}
