import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { computeNextRunAt, isValidCron } from '$lib/server/agents/scheduler.js';
import { requireUser } from '$lib/server/auth/guards.js';
import { getDb, type Db } from '$lib/server/db/index.js';
import {
	deleteAgent,
	getAgent,
	listAgentOverrides,
	setAgentOverride,
	toPublic,
	toPublicWithOverrides,
	updateAgent,
	type AgentRow
} from '$lib/server/db/repo/agents.js';
import type { AgentTriggerConfig, AgentTriggerType } from '$lib/types.js';
import { AGENT_EVENT_NAMES } from '$lib/types.js';
import type { RequestHandler } from './$types';

function visibleAgent(db: Db, userId: string, id: string): AgentRow {
	const agent = getAgent(db, id);
	if (!agent || (agent.user_id !== userId && agent.user_id !== null)) {
		error(404, { message: 'Agent not found' });
	}
	return agent;
}

function mutableAgent(db: Db, userId: string, id: string): AgentRow {
	const agent = visibleAgent(db, userId, id);
	if (agent.user_id !== userId) {
		error(403, { message: 'Built-in agents cannot be modified' });
	}
	return agent;
}

export const GET: RequestHandler = ({ locals, params }) => {
	const user = requireUser(locals);
	const db = getDb();
	const agent = visibleAgent(db, user.id, params.id);
	return json({ agent: toPublicWithOverrides(agent, listAgentOverrides(db, user.id)) });
};

const patchSchema = z.object({
	name: z.string().trim().min(1).max(100).optional(),
	description: z.string().max(500).optional(),
	systemPrompt: z.string().trim().min(1).max(20000).optional(),
	providerId: z.string().nullable().optional(),
	modelId: z.string().nullable().optional(),
	skillNames: z.array(z.string()).max(50).optional(),
	toolAllowlist: z.array(z.string()).max(200).nullable().optional(),
	triggerType: z.enum(['persona', 'schedule', 'http', 'manual', 'event']).optional(),
	triggerConfig: z
		.object({
			cron: z.string().optional(),
			instructions: z.string().max(4000).optional(),
			event: z.enum(AGENT_EVENT_NAMES).optional(),
			every: z.number().int().min(1).max(1000).optional()
		})
		.optional(),
	maxSteps: z.number().int().min(1).max(100).nullable().optional(),
	enabled: z.boolean().optional()
});

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const user = requireUser(locals);
	const parsed = patchSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, { message: parsed.error.issues[0]?.message ?? 'Invalid body' });
	const db = getDb();
	const agent = visibleAgent(db, user.id, params.id);
	const data = parsed.data;

	if (agent.user_id === null) {
		if (data.enabled === undefined || Object.keys(data).some((key) => key !== 'enabled')) {
			error(403, { message: 'Built-in agents cannot be modified' });
		}
		setAgentOverride(db, user.id, agent.id, data.enabled);
		return json({ agent: toPublicWithOverrides(agent, listAgentOverrides(db, user.id)) });
	}

	let nextRunAt: number | null | undefined;
	if (
		data.triggerType !== undefined ||
		data.triggerConfig?.cron !== undefined ||
		data.triggerConfig?.event !== undefined ||
		data.enabled !== undefined
	) {
		const triggerType = (data.triggerType ?? agent.trigger_type) as AgentTriggerType;
		const existingConfig = JSON.parse(agent.trigger_config) as AgentTriggerConfig;
		const cron = data.triggerConfig?.cron ?? existingConfig.cron;
		const event = data.triggerConfig?.event ?? existingConfig.event;
		const enabled = data.enabled ?? agent.enabled === 1;
		if (triggerType === 'schedule') {
			if (!cron) error(400, { message: 'Schedule trigger requires a cron expression' });
			if (!isValidCron(cron)) error(400, { message: 'Invalid cron expression' });
			nextRunAt = enabled ? computeNextRunAt(cron) : null;
		} else {
			if (triggerType === 'event' && !event) {
				error(400, { message: 'Event trigger requires an event name' });
			}
			nextRunAt = null;
		}
	}

	const updated = updateAgent(db, agent.id, {
		...data,
		...(nextRunAt !== undefined ? { nextRunAt } : {})
	});
	return json({ agent: toPublic(updated!) });
};

export const DELETE: RequestHandler = ({ locals, params }) => {
	const user = requireUser(locals);
	const db = getDb();
	const agent = mutableAgent(db, user.id, params.id);
	deleteAgent(db, agent.id);
	return json({ ok: true });
};
