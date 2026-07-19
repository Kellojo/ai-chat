import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { testConnection } from '$lib/server/mcp/clientManager.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params }) => {
	requireAdmin(locals);
	return json(await testConnection(getDb(), params.id));
};
