import { requireUser } from '$lib/server/auth/guards.js';
import { listTree } from '$lib/server/memory/bundle.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const user = requireUser(locals);
	return { tree: listTree('user', user.id) };
};
