import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { requireAdmin } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import {
	getModel,
	listRoleDefaults,
	MODEL_ROLES,
	setRoleDefault
} from '$lib/server/db/repo/models.js';
import { getModelMapping } from '$lib/server/db/repo/model-mappings.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	requireAdmin(locals);
	return json({ roles: listRoleDefaults(getDb()) });
};

const putSchema = z.object({
	role: z.enum(MODEL_ROLES),
	modelId: z.string().min(1).nullable()
});

export const PUT: RequestHandler = async ({ locals, request }) => {
	requireAdmin(locals);
	const parsed = putSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, { message: 'Invalid request body' });
	const db = getDb();
	const modelId = parsed.data.modelId;
	if (modelId !== null) {
		const valid = modelId.startsWith('mapping:')
			? (() => {
					const mapping = getModelMapping(db, modelId.slice('mapping:'.length));
					return mapping !== undefined && mapping.enabled === 1;
				})()
			: getModel(db, modelId) !== undefined;
		if (!valid) error(404, { message: 'Model not found' });
	}
	setRoleDefault(db, parsed.data.role, modelId);
	return json({ roles: listRoleDefaults(db) });
};
