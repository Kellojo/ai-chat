import { describe, expect, it } from 'vitest';
import { openDatabase } from '../index.js';
import { deleteSetting, getAllSettings, getSetting, setSetting } from './settings.js';

describe('settings repo', () => {
	it('round-trips JSON values and lists all keys', () => {
		const db = openDatabase(':memory:');
		setSetting(db, 'app.name', 'AI Chat');
		setSetting(db, 'limits', { attachmentsMb: 50 });
		expect(getSetting<string>(db, 'app.name')).toBe('AI Chat');
		expect(getSetting(db, 'limits')).toEqual({ attachmentsMb: 50 });
		expect(getSetting(db, 'missing')).toBeUndefined();
		expect(getAllSettings(db)).toEqual({
			'app.name': 'AI Chat',
			limits: { attachmentsMb: 50 }
		});
		setSetting(db, 'app.name', 'Renamed');
		expect(getSetting(db, 'app.name')).toBe('Renamed');
		deleteSetting(db, 'app.name');
		expect(getSetting(db, 'app.name')).toBeUndefined();
		db.close();
	});
});
