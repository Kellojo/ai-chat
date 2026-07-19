import { requireAdmin } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { listProviders, toPublic } from '$lib/server/db/repo/providers.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	requireAdmin(locals);
	return { providers: listProviders(getDb()).map(toPublic) };
};
