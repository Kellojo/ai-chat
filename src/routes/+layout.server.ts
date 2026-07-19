import { getDb } from '$lib/server/db/index.js';
import { getUserSettings } from '$lib/server/db/repo/user-settings.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	return {
		theme: locals.user ? getUserSettings(getDb(), locals.user.id).theme : 'system'
	};
};
