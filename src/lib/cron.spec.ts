import { describe, expect, it } from 'vitest';
import { describeCron } from './cron.js';

describe('describeCron', () => {
	it('returns null for missing cron', () => {
		expect(describeCron(undefined, 'auto')).toBeNull();
		expect(describeCron('', 'auto')).toBeNull();
	});

	it('returns null for invalid cron', () => {
		expect(describeCron('not a cron', 'auto')).toBeNull();
	});

	it('describes a valid cron expression', () => {
		expect(describeCron('*/30 * * * *', 'auto')).toBe('Every 30 minutes');
	});

	it('honours the 12h/24h time format', () => {
		expect(describeCron('0 9 * * *', '12h')).toBe('At 09:00 AM');
		expect(describeCron('0 9 * * *', 'auto')).toBe('At 09:00 AM');
		expect(describeCron('0 9 * * *', '24h')).toBe('At 09:00');
	});
});
