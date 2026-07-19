import { requireAdmin } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { listModels, toPublic as modelToPublic } from '$lib/server/db/repo/models.js';
import { listProviders, toPublic as providerToPublic } from '$lib/server/db/repo/providers.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	requireAdmin(locals);
	const db = getDb();
	return {
		providers: listProviders(db).map(providerToPublic),
		models: listModels(db).map(modelToPublic)
	};
};
