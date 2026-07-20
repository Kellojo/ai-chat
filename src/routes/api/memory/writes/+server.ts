import { json } from '@sveltejs/kit';
import { requireAdmin, requireUser } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { listMemoryWrites } from '$lib/server/db/repo/memory-writes.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, url }) => {
	const scope = url.searchParams.get('scope') === 'shared' ? 'shared' : 'user';
	const user = scope === 'shared' ? requireAdmin(locals) : requireUser(locals);
	const limitParam = url.searchParams.get('limit');
	const parsedLimit = limitParam === null ? NaN : Number(limitParam);
	const writes = listMemoryWrites(getDb(), {
		userId: scope === 'user' ? user.id : undefined,
		conceptPath: url.searchParams.get('path') ?? undefined,
		scope,
		limit: Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : undefined
	});
	return json({ writes });
};
