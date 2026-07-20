import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { listRunningAgentIds } from '$lib/server/db/repo/agent-runs.js';
import { effectiveEnabled, listAgentOverrides, listAgents } from '$lib/server/db/repo/agents.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	const user = requireUser(locals);
	const db = getDb();
	const overrides = listAgentOverrides(db, user.id);
	const agents = listAgents(db, user.id);
	const running = new Set(
		listRunningAgentIds(
			db,
			agents.map((a) => a.id)
		)
	);
	let total = 0;
	for (const a of agents) {
		if (effectiveEnabled(a, overrides) || running.has(a.id)) total++;
	}
	return json({ running: running.size, total });
};
