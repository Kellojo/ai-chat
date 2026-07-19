import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { deleteApiKey } from '$lib/server/db/repo/api-keys.js';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = ({ locals, params }) => {
	const user = requireUser(locals);
	if (!deleteApiKey(getDb(), params.id, user.id)) {
		error(404, { message: 'API key not found' });
	}
	return json({ ok: true });
};
