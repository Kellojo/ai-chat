import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/guards.js';
import { abortStream } from '$lib/server/chat/streams.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ locals, params }) => {
	requireUser(locals);
	return json({ aborted: abortStream(params.id) });
};
