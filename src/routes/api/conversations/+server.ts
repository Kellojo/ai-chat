import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { requireUser } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import {
	createConversation,
	listConversations,
	toPublic
} from '$lib/server/db/repo/conversations.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	const user = requireUser(locals);
	return json({
		conversations: listConversations(getDb(), user.id).map(toPublic)
	});
};

const createSchema = z.object({
	providerId: z.string().nullish(),
	modelId: z.string().nullish(),
	mode: z.enum(['chat', 'agent']).optional()
});

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) error(400, { message: parsed.error.issues[0]?.message ?? 'Invalid body' });
	const conversation = createConversation(getDb(), user.id, parsed.data);
	return json({ conversation: toPublic(conversation) }, { status: 201 });
};
