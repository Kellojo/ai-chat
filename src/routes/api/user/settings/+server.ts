import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { requireUser } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import {
	getUserSettings,
	setUserSetting,
	deleteUserSetting
} from '$lib/server/db/repo/user-settings.js';
import {
	MAX_GLOBAL_INSTRUCTIONS_LENGTH,
	MAX_SUGGESTIONS,
	THEMES,
	TIME_FORMATS
} from '$lib/user-settings.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	const user = requireUser(locals);
	return json({ settings: getUserSettings(getDb(), user.id) });
};

const putSchema = z
	.object({
		theme: z.enum(THEMES).optional(),
		suggestions: z.array(z.string().trim().min(1).max(200)).max(MAX_SUGGESTIONS).optional(),
		globalInstructions: z.string().trim().max(MAX_GLOBAL_INSTRUCTIONS_LENGTH).optional(),
		timeFormat: z.enum(TIME_FORMATS).optional()
	})
	.refine(
		(data) =>
			data.theme !== undefined ||
			data.suggestions !== undefined ||
			data.globalInstructions !== undefined ||
			data.timeFormat !== undefined,
		{ message: 'Nothing to update' }
	);

export const PUT: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const parsed = putSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, { message: 'Invalid request body' });
	const db = getDb();
	if (parsed.data.theme !== undefined) setUserSetting(db, user.id, 'theme', parsed.data.theme);
	if (parsed.data.timeFormat !== undefined) {
		setUserSetting(db, user.id, 'timeFormat', parsed.data.timeFormat);
	}
	if (parsed.data.suggestions !== undefined) {
		setUserSetting(db, user.id, 'suggestions', parsed.data.suggestions);
	}
	if (parsed.data.globalInstructions !== undefined) {
		if (parsed.data.globalInstructions === '') {
			deleteUserSetting(db, user.id, 'globalInstructions');
		} else {
			setUserSetting(db, user.id, 'globalInstructions', parsed.data.globalInstructions);
		}
	}
	return json({ settings: getUserSettings(db, user.id) });
};
