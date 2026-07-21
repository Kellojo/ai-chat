import { json, error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { getProvider } from '$lib/server/db/repo/providers.js';
import { upsertFetchedModels, type FetchedModel } from '$lib/server/db/repo/models.js';
import { fetchProviderModels } from '$lib/server/llm/registry.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params }) => {
	requireAdmin(locals);
	const db = getDb();
	if (!getProvider(db, params.id)) error(404, { message: 'Provider not found' });
	let fetched: FetchedModel[];
	try {
		fetched = await fetchProviderModels(params.id);
	} catch (e) {
		error(502, { message: e instanceof Error ? e.message : 'Failed to fetch models' });
	}
	const result = upsertFetchedModels(db, params.id, fetched);
	return json(result);
};
