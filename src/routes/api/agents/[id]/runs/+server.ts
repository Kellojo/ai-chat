import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { listAgentRuns, toPublic } from '$lib/server/db/repo/agent-runs.js';
import { getAgent } from '$lib/server/db/repo/agents.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, params, url }) => {
	const user = requireUser(locals);
	const db = getDb();
	const agent = getAgent(db, params.id);
	if (!agent) error(404, { message: 'Agent not found' });
	if (agent.user_id !== null && agent.user_id !== user.id) {
		error(404, { message: 'Agent not found' });
	}
	const raw = Number(url.searchParams.get('limit') ?? '50');
	const limit = Number.isInteger(raw) && raw >= 1 && raw <= 200 ? raw : 50;
	const scopedUserId =
		agent.user_id === null && (user as { role?: string }).role !== 'admin' ? user.id : undefined;
	return json({ runs: listAgentRuns(db, agent.id, limit, scopedUserId).map(toPublic) });
};
