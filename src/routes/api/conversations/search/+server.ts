import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { searchConversations, toPublic } from '$lib/server/db/repo/conversations.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, url }) => {
	const user = requireUser(locals);
	const q = url.searchParams.get('q')?.trim() ?? '';
	if (!q) return json({ conversations: [] });
	return json({
		conversations: searchConversations(getDb(), user.id, q).map(toPublic)
	});
};
