import { requireAdmin } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { listMcpServers, toPublic } from '$lib/server/db/repo/mcp-servers.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	requireAdmin(locals);
	return { servers: listMcpServers(getDb()).map(toPublic) };
};
