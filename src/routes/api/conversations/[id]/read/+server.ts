import { error, json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { getConversation, markConversationRead } from '$lib/server/db/repo/conversations.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ locals, params }) => {
	const user = requireUser(locals);
	const db = getDb();
	if (!getConversation(db, user.id, params.id)) {
		error(404, { message: 'Conversation not found' });
	}
	markConversationRead(db, user.id, params.id);
	return json({ ok: true });
};
