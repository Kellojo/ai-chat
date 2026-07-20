import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { reindexMemoryFts } from '$lib/server/memory/fts.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ locals }) => {
	requireAdmin(locals);
	return json(reindexMemoryFts(getDb()));
};
