import { error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { getAgent, toPublic as agentToPublic } from '$lib/server/db/repo/agents.js';
import { listAgentRuns, toPublic as runToPublic } from '$lib/server/db/repo/agent-runs.js';
import { getTimeFormat } from '$lib/server/db/repo/user-settings.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const user = requireUser(locals);
	const db = getDb();
	const agent = getAgent(db, params.id);
	const isAdmin = (user as { role?: string }).role === 'admin';
	if (!agent || (agent.user_id !== user.id && !(agent.user_id === null && isAdmin))) {
		error(404, { message: 'Agent not found' });
	}
	return {
		agent: agentToPublic(agent),
		runs: listAgentRuns(db, agent.id).map(runToPublic),
		timeFormat: getTimeFormat(db, user.id)
	};
};
