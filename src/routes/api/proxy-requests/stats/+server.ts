import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { listProxyRequests, proxyRequestStats } from '$lib/server/db/repo/proxy-requests.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	requireAdmin(locals);
	const db = getDb();
	const stats = proxyRequestStats(db, {});
	const running = listProxyRequests(db, { status: 'running' }, 1, 0).total;
	return json({ count: stats.total, running });
};
