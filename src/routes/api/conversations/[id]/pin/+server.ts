import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { togglePin, toPublic } from '$lib/server/db/repo/conversations.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ locals, params }) => {
	const user = requireUser(locals);
	const conversation = togglePin(getDb(), user.id, params.id);
	if (!conversation) error(404, { message: 'Conversation not found' });
	return json({ conversation: toPublic(conversation) });
};
