import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { requireAdmin } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { createProvider, listProviders, toPublic } from '$lib/server/db/repo/providers.js';
import type { RequestHandler } from './$types';

const createSchema = z.object({
	name: z.string().min(1).max(100),
	type: z.enum(['anthropic', 'openai-compatible']),
	baseUrl: z.url().nullish(),
	apiKey: z.string().min(1).nullish(),
	enabled: z.boolean().optional()
});

export const GET: RequestHandler = ({ locals }) => {
	requireAdmin(locals);
	return json({ providers: listProviders(getDb()).map(toPublic) });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	requireAdmin(locals);
	const parsed = createSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, { message: parsed.error.issues[0]?.message ?? 'Invalid body' });
	if (parsed.data.type === 'openai-compatible' && !parsed.data.baseUrl) {
		error(400, { message: 'baseUrl is required for openai-compatible providers' });
	}
	const provider = createProvider(getDb(), parsed.data);
	return json({ provider: toPublic(provider) }, { status: 201 });
};
