import { requireAdmin } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { getSetting } from '$lib/server/db/repo/settings.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	requireAdmin(locals);
	const db = getDb();
	const baseUrl = getSetting<string>(db, 'websearch.searxng.base_url') ?? '';
	const defaultLimitRaw = getSetting<number>(db, 'websearch.default_limit');
	const timeoutRaw = getSetting<number>(db, 'websearch.timeout_ms');
	const safeSearchRaw = getSetting<number>(db, 'websearch.safe_search');
	const language = getSetting<string>(db, 'websearch.language') ?? 'auto';
	return {
		settings: {
			baseUrl,
			defaultLimit:
				typeof defaultLimitRaw === 'number' && defaultLimitRaw >= 1 && defaultLimitRaw <= 10
					? Math.floor(defaultLimitRaw)
					: 5,
			timeoutMs:
				typeof timeoutRaw === 'number' && timeoutRaw >= 1000 && timeoutRaw <= 60000
					? Math.floor(timeoutRaw)
					: 15000,
			safeSearch: safeSearchRaw === 0 || safeSearchRaw === 2 ? safeSearchRaw : 1,
			language
		}
	};
};
