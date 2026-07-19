import { redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/index.js';
import {
	listConversations,
	listUnreadChatIds,
	toPublic
} from '$lib/server/db/repo/conversations.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');
	const db = getDb();
	return {
		user: {
			name: locals.user.name,
			email: locals.user.email,
			role: (locals.user as { role?: string }).role ?? 'user'
		},
		conversations: listConversations(db, locals.user.id).map(toPublic),
		unreadIds: listUnreadChatIds(db, locals.user.id)
	};
};
