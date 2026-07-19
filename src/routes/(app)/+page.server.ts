import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/index.js';
import { findRoleModel } from '$lib/server/db/repo/models.js';
import { getUserSettings } from '$lib/server/db/repo/user-settings.js';
import { listModelsGrouped } from '$lib/server/llm/registry.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const user = locals.user;
	if (!user) error(401, { message: 'Unauthorized' });
	const db = getDb();
	const roleModel = findRoleModel(db, 'chat');
	return {
		groups: listModelsGrouped(),
		defaultModel: roleModel
			? { providerId: roleModel.provider_id, modelId: roleModel.model_id }
			: null,
		suggestions: getUserSettings(db, user.id).suggestions
	};
};
