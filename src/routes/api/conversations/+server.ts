import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { requireUser } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { getAgent } from '$lib/server/db/repo/agents.js';
import {
	createConversation,
	listConversations,
	toPublic,
	updateConversation
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
	mode: z.enum(['chat', 'agent']).optional(),
	agentId: z.string().nullable().optional()
});

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) error(400, { message: parsed.error.issues[0]?.message ?? 'Invalid body' });
	const db = getDb();
	const { agentId } = parsed.data;
	let agent;
	if (agentId != null) {
		agent = getAgent(db, agentId);
		if (!agent || (agent.user_id !== user.id && agent.user_id !== null)) {
			error(404, { message: 'Agent not found' });
		}
	}
	const conversation = createConversation(db, user.id, parsed.data);
	if (agent) {
		const updated = updateConversation(db, user.id, conversation.id, {
			systemPrompt: agent.system_prompt,
			...(agent.provider_id && agent.model_id
				? { providerId: agent.provider_id, modelId: agent.model_id }
				: {})
		});
		return json({ conversation: toPublic(updated!) }, { status: 201 });
	}
	return json({ conversation: toPublic(conversation) }, { status: 201 });
};
