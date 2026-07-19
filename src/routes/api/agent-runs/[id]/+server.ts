import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { getAgentRun, toPublic } from '$lib/server/db/repo/agent-runs.js';
import { listMessages, toPublic as messageToPublic } from '$lib/server/db/repo/messages.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, params }) => {
	const user = requireUser(locals);
	const db = getDb();
	const run = getAgentRun(db, params.id);
	if (!run || (run.user_id !== user.id && (user as { role?: string }).role !== 'admin')) {
		error(404, { message: 'Agent run not found' });
	}
	const messages = run.conversation_id
		? listMessages(db, run.conversation_id).map(messageToPublic)
		: [];
	return json({ run: toPublic(run), messages });
};
