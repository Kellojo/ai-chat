import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { computeNextRunAt, isValidCron } from '../../agents/scheduler.js';
import { getDb, type Db } from '../../db/index.js';
import {
	createAgent,
	getAgent,
	listAgentOverrides,
	listAgents,
	setAgentOverride,
	toPublic,
	toPublicWithOverrides,
	updateAgent,
	type AgentRow
} from '../../db/repo/agents.js';
import { isSelectableModelRef } from '../../llm/mapped.js';
import { AGENT_EVENT_NAMES, type AgentTriggerConfig, type AgentTriggerType } from '../../../types.js';
import type { CallerContext } from '../types.js';
import { err, text } from './shared.js';

const triggerConfigSchema = z.object({
	cron: z.string().optional(),
	instructions: z.string().max(4000).optional(),
	event: z.enum(AGENT_EVENT_NAMES).optional(),
	every: z.number().int().min(1).max(1000).optional()
});

const triggerTypeSchema = z.enum(['persona', 'schedule', 'http', 'manual', 'event']);

function visibleAgent(db: Db, userId: string, id: string): AgentRow | { error: string } {
	const agent = getAgent(db, id);
	if (!agent || (agent.user_id !== userId && agent.user_id !== null)) {
		return { error: 'agent not found' };
	}
	return agent;
}

function validateModelRef(
	db: Db,
	providerId: string | null | undefined,
	modelId: string | null | undefined
): string | null {
	if ((providerId == null) !== (modelId == null)) {
		return 'providerId and modelId must be provided together';
	}
	if (providerId && modelId && !isSelectableModelRef({ providerId, modelId }, db)) {
		return `unknown model: ${providerId}/${modelId}`;
	}
	return null;
}

export function createAgentsServer(ctx: CallerContext): McpServer {
	const server = new McpServer({ name: 'ai-chat-agents', version: '0.1.0' });

	server.registerTool(
		'list_agents',
		{
			description: "List the current user's agents (including built-in agents)"
		},
		async () => {
			const db = getDb();
			const overrides = listAgentOverrides(db, ctx.userId);
			const agents = listAgents(db, ctx.userId).map((row) =>
				toPublicWithOverrides(row, overrides)
			);
			return text(JSON.stringify(agents));
		}
	);

	server.registerTool(
		'get_agent',
		{
			description: 'Get a single agent by id',
			inputSchema: { id: z.string() }
		},
		async ({ id }) => {
			const db = getDb();
			const agent = visibleAgent(db, ctx.userId, id);
			if ('error' in agent) return err(agent.error);
			return text(JSON.stringify(toPublicWithOverrides(agent, listAgentOverrides(db, ctx.userId))));
		}
	);

	server.registerTool(
		'create_agent',
		{
			description:
				'Create a new agent for the current user. Model may be a concrete providerId/modelId pair or a mapped model via providerId="mapping:<id>".',
			inputSchema: {
				name: z.string().trim().min(1).max(100),
				description: z.string().max(500).optional(),
				systemPrompt: z.string().trim().min(1).max(20000),
				providerId: z.string().nullable().optional(),
				modelId: z.string().nullable().optional(),
				skillNames: z.array(z.string()).max(50).optional(),
				toolAllowlist: z.array(z.string()).max(200).nullable().optional(),
				triggerType: triggerTypeSchema,
				triggerConfig: triggerConfigSchema.optional(),
				maxSteps: z.number().int().min(1).max(100).nullable().optional(),
				enabled: z.boolean().optional()
			}
		},
		async (args) => {
			const db = getDb();
			const triggerConfig = args.triggerConfig ?? {};
			if (args.triggerType === 'schedule') {
				if (!triggerConfig.cron) return err('schedule trigger requires a cron expression');
				if (!isValidCron(triggerConfig.cron)) return err('invalid cron expression');
			}
			if (args.triggerType === 'event' && !triggerConfig.event) {
				return err('event trigger requires an event name');
			}
			const modelError = validateModelRef(db, args.providerId, args.modelId);
			if (modelError) return err(modelError);
			const enabled = args.enabled ?? true;
			const nextRunAt =
				args.triggerType === 'schedule' && enabled
					? computeNextRunAt(triggerConfig.cron!)
					: null;
			const agent = createAgent(db, ctx.userId, {
				name: args.name,
				description: args.description,
				systemPrompt: args.systemPrompt,
				providerId: args.providerId ?? null,
				modelId: args.modelId ?? null,
				skillNames: args.skillNames ?? [],
				toolAllowlist: args.toolAllowlist ?? null,
				triggerType: args.triggerType,
				triggerConfig,
				maxSteps: args.maxSteps ?? null,
				enabled,
				nextRunAt
			});
			return text(JSON.stringify(toPublic(agent)));
		}
	);

	server.registerTool(
		'update_agent',
		{
			description:
				'Update an existing agent owned by the current user (omitted fields keep their current values). Built-in agents can only be enabled/disabled. Set providerId and modelId to null to clear the model override.',
			inputSchema: {
				id: z.string(),
				name: z.string().trim().min(1).max(100).optional(),
				description: z.string().max(500).optional(),
				systemPrompt: z.string().trim().min(1).max(20000).optional(),
				providerId: z.string().nullable().optional(),
				modelId: z.string().nullable().optional(),
				skillNames: z.array(z.string()).max(50).optional(),
				toolAllowlist: z.array(z.string()).max(200).nullable().optional(),
				triggerType: triggerTypeSchema.optional(),
				triggerConfig: triggerConfigSchema.optional(),
				maxSteps: z.number().int().min(1).max(100).nullable().optional(),
				enabled: z.boolean().optional()
			}
		},
		async ({ id, ...data }) => {
			const db = getDb();
			const agent = visibleAgent(db, ctx.userId, id);
			if ('error' in agent) return err(agent.error);

			if (agent.user_id === null) {
				if (data.enabled === undefined || Object.keys(data).some((key) => key !== 'enabled')) {
					return err('built-in agents can only be enabled or disabled');
				}
				setAgentOverride(db, ctx.userId, agent.id, data.enabled);
				return text(
					JSON.stringify(toPublicWithOverrides(agent, listAgentOverrides(db, ctx.userId)))
				);
			}

			if (data.providerId !== undefined || data.modelId !== undefined) {
				const modelError = validateModelRef(db, data.providerId, data.modelId);
				if (modelError) return err(modelError);
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
					if (!cron) return err('schedule trigger requires a cron expression');
					if (!isValidCron(cron)) return err('invalid cron expression');
					nextRunAt = enabled ? computeNextRunAt(cron) : null;
				} else {
					if (triggerType === 'event' && !event) {
						return err('event trigger requires an event name');
					}
					nextRunAt = null;
				}
			}

			const updated = updateAgent(db, agent.id, {
				...data,
				...(nextRunAt !== undefined ? { nextRunAt } : {})
			});
			if (!updated) return err('agent not found');
			return text(JSON.stringify(toPublic(updated)));
		}
	);

	return server;
}
