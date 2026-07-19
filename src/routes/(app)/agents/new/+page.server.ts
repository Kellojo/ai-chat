import { requireUser } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { listEnabledModels, toPublic as modelToPublic } from '$lib/server/db/repo/models.js';
import { buildTools } from '$lib/server/tools/registry.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	const db = getDb();
	const built = await buildTools({ userId: user.id, mode: 'agent', memoryEnabled: true });
	try {
		const tools = Object.entries(built.tools)
			.map(([name, t]) => ({
				name,
				description: typeof t.description === 'string' ? t.description : '',
				server: built.toolToServer[name] ?? ''
			}))
			.sort((a, b) => a.server.localeCompare(b.server) || a.name.localeCompare(b.name));
		return {
			models: listEnabledModels(db).map(modelToPublic),
			tools
		};
	} finally {
		await built.close();
	}
};
