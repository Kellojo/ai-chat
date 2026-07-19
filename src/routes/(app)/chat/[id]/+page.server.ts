import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/index.js';
import {
	getConversation,
	toPublic as conversationToPublic
} from '$lib/server/db/repo/conversations.js';
import { listMessages, toPublic as messageToPublic } from '$lib/server/db/repo/messages.js';
import { listModelsGrouped } from '$lib/server/llm/registry.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user;
	if (!user) error(401, { message: 'Unauthorized' });
	const db = getDb();
	const conversation = getConversation(db, user.id, params.id);
	if (!conversation || conversation.kind !== 'chat')
		error(404, { message: 'Conversation not found' });
	return {
		conversation: conversationToPublic(conversation),
		messages: listMessages(db, conversation.id).map(messageToPublic),
		groups: listModelsGrouped()
	};
};
