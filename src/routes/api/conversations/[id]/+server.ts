import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { requireUser } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import {
	getConversation,
	softDeleteConversation,
	toPublic as conversationToPublic,
	updateConversation
} from '$lib/server/db/repo/conversations.js';
import { listMessages, toPublic as messageToPublic } from '$lib/server/db/repo/messages.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, params }) => {
	const user = requireUser(locals);
	const db = getDb();
	const conversation = getConversation(db, user.id, params.id);
	if (!conversation) error(404, { message: 'Conversation not found' });
	return json({
		conversation: conversationToPublic(conversation),
		messages: listMessages(db, params.id).map(messageToPublic)
	});
};

const patchSchema = z.object({
	title: z.string().max(200).optional(),
	mode: z.enum(['chat', 'agent']).optional(),
	providerId: z.string().nullable().optional(),
	modelId: z.string().nullable().optional(),
	systemPrompt: z.string().max(10000).nullable().optional(),
	memoryEnabled: z.boolean().optional(),
	maxSteps: z.number().int().min(1).max(100).nullable().optional(),
	temperature: z.number().min(0).max(2).nullable().optional(),
	maxTokens: z.number().int().min(1).nullable().optional()
});

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const user = requireUser(locals);
	const parsed = patchSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, { message: parsed.error.issues[0]?.message ?? 'Invalid body' });
	const conversation = updateConversation(getDb(), user.id, params.id, parsed.data);
	if (!conversation) error(404, { message: 'Conversation not found' });
	return json({ conversation: conversationToPublic(conversation) });
};

export const DELETE: RequestHandler = ({ locals, params }) => {
	const user = requireUser(locals);
	if (!softDeleteConversation(getDb(), user.id, params.id)) {
		error(404, { message: 'Conversation not found' });
	}
	return json({ ok: true });
};
