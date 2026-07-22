import { requireUser } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { listApiKeys, toPublic } from '$lib/server/db/repo/api-keys.js';
import { proxyRequestStats } from '$lib/server/db/repo/proxy-requests.js';
import { getTimeFormat, getUserSetting } from '$lib/server/db/repo/user-settings.js';
import type { PageServerLoad } from './$types';

const CAVEMAN_LEVELS = ['off', 'lite', 'full', 'ultra', 'wenyan'] as const;

type CavemanLevel = (typeof CAVEMAN_LEVELS)[number];

export const load: PageServerLoad = ({ locals }) => {
	const user = requireUser(locals);
	const db = getDb();
	const caveman = getUserSetting<string>(db, user.id, 'proxyCaveman');
	const stats = proxyRequestStats(db, { userId: user.id });
	return {
		apiKeys: listApiKeys(db, user.id).map(toPublic),
		timeFormat: getTimeFormat(db, user.id),
		proxySettings: {
			caveman: CAVEMAN_LEVELS.includes(caveman as CavemanLevel) ? (caveman as CavemanLevel) : 'off'
		},
		savings: {
			total: stats.total,
			cavemanSaved: stats.cavemanSaved
		}
	};
};
