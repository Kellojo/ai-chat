import cronstrue from 'cronstrue';
import type { TimeFormat } from '$lib/user-settings.js';

export function describeCron(cron: string | undefined, timeFormat: TimeFormat): string | null {
	if (!cron) return null;
	try {
		return cronstrue.toString(cron, { use24HourTimeFormat: timeFormat === '24h' });
	} catch {
		return null;
	}
}
