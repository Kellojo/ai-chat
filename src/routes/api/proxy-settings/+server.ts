import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { requireUser } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { getUserSetting, setUserSetting } from '$lib/server/db/repo/user-settings.js';
import type { RequestHandler } from './$types';

const CAVEMAN_LEVELS = ['off', 'lite', 'full', 'ultra', 'wenyan'] as const;

type CavemanLevel = (typeof CAVEMAN_LEVELS)[number];

export interface ProxySettings {
	caveman: CavemanLevel;
}

function getProxySettings(db: ReturnType<typeof getDb>, userId: string): ProxySettings {
	const caveman = getUserSetting<string>(db, userId, 'proxyCaveman');
	return {
		caveman: CAVEMAN_LEVELS.includes(caveman as CavemanLevel) ? (caveman as CavemanLevel) : 'off'
	};
}

const postSchema = z.object({
	caveman: z.enum(CAVEMAN_LEVELS)
});

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const parsed = postSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, { message: 'Invalid request body' });
	const db = getDb();
	setUserSetting(db, user.id, 'proxyCaveman', parsed.data.caveman);
	return json({ settings: getProxySettings(db, user.id) });
};
