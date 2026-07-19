import { redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/index.js';
import { listConversations, toPublic } from '$lib/server/db/repo/conversations.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');
	return {
		user: {
			name: locals.user.name,
			email: locals.user.email,
			role: (locals.user as { role?: string }).role ?? 'user'
		},
		conversations: listConversations(getDb(), locals.user.id).map(toPublic)
	};
};
