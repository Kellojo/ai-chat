import { requireUser } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { listRunningAgentIds } from '$lib/server/db/repo/agent-runs.js';
import {
	listAgentOverrides,
	listAgents,
	toPublicWithOverrides
} from '$lib/server/db/repo/agents.js';
import { getTimeFormat } from '$lib/server/db/repo/user-settings.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const user = requireUser(locals);
	const db = getDb();
	const agents = listAgents(db, user.id);
	const overrides = listAgentOverrides(db, user.id);
	return {
		agents: agents.map((agent) => toPublicWithOverrides(agent, overrides)),
		runningAgentIds: listRunningAgentIds(
			db,
			agents.map((a) => a.id)
		),
		timeFormat: getTimeFormat(db, user.id)
	};
};
