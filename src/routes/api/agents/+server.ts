import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { computeNextRunAt, isValidCron } from '$lib/server/agents/scheduler.js';
import { requireUser } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import {
	createAgent,
	listAgents,
	listPersonaAgents,
	toPublic
} from '$lib/server/db/repo/agents.js';
import { findModel } from '$lib/server/db/repo/models.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, url }) => {
	const user = requireUser(locals);
	const db = getDb();
	const rows =
		url.searchParams.get('trigger') === 'persona'
			? listPersonaAgents(db, user.id)
			: listAgents(db, user.id);
	return json({ agents: rows.map(toPublic) });
};

const triggerConfigSchema = z.object({
	cron: z.string().optional(),
	instructions: z.string().max(4000).optional()
});

const createSchema = z.object({
	name: z.string().trim().min(1).max(100),
	description: z.string().max(500).default(''),
	systemPrompt: z.string().trim().min(1).max(20000),
	providerId: z.string().nullable().optional(),
	modelId: z.string().nullable().optional(),
	skillNames: z.array(z.string()).max(50).default([]),
	toolAllowlist: z.array(z.string()).max(200).nullable().default(null),
	triggerType: z.enum(['persona', 'schedule', 'http', 'manual']),
	triggerConfig: triggerConfigSchema.default({}),
	maxSteps: z.number().int().min(1).max(100).nullable().default(null),
	enabled: z.boolean().default(true)
});

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const parsed = createSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, { message: parsed.error.issues[0]?.message ?? 'Invalid body' });
	const input = parsed.data;
	const db = getDb();
	if (input.triggerType === 'schedule') {
		if (!input.triggerConfig.cron) {
			error(400, { message: 'Schedule trigger requires a cron expression' });
		}
		if (!isValidCron(input.triggerConfig.cron)) {
			error(400, { message: 'Invalid cron expression' });
		}
	}
	if ((input.providerId == null) !== (input.modelId == null)) {
		error(400, { message: 'providerId and modelId must be provided together' });
	}
	if (input.providerId && input.modelId && !findModel(db, input.providerId, input.modelId)) {
		error(400, { message: 'Unknown model' });
	}
	const nextRunAt =
		input.triggerType === 'schedule' && input.enabled
			? computeNextRunAt(input.triggerConfig.cron!)
			: null;
	const agent = createAgent(db, user.id, { ...input, nextRunAt });
	return json({ agent: toPublic(agent) }, { status: 201 });
};
