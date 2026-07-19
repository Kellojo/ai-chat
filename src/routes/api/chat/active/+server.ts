import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/guards.js';
import { listActiveStreamIds } from '$lib/server/chat/streams.js';
import { getDb } from '$lib/server/db/index.js';
import { getConversation } from '$lib/server/db/repo/conversations.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	const user = requireUser(locals);
	const db = getDb();
	const conversationIds = listActiveStreamIds().filter((id) => getConversation(db, user.id, id));
	return json({ conversationIds });
};
