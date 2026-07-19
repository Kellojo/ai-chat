import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/index.js';
import { findRoleModel } from '$lib/server/db/repo/models.js';
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
	const roleModel = findRoleModel(db, 'chat');
	return {
		conversation: conversationToPublic(conversation),
		messages: listMessages(db, conversation.id).map(messageToPublic),
		groups: listModelsGrouped(),
		defaultModel: roleModel
			? { providerId: roleModel.provider_id, modelId: roleModel.model_id }
			: null
	};
};
