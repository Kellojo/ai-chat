import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { computeNextRunAt, isValidCron } from '../../agents/scheduler.js';
import { getDb } from '../../db/index.js';
import {
	createAgent,
	deleteAgent,
	getAgent,
	listAgents,
	toPublic,
	updateAgent
} from '../../db/repo/agents.js';
import { AGENT_EVENT_NAMES, type AgentTriggerType } from '../../../types.js';
import type { CallerContext } from '../types.js';
import { err, text } from './shared.js';

const triggerConfigSchema = z.object({
	cron: z.string().optional(),
	instructions: z.string().optional(),
	event: z.enum(AGENT_EVENT_NAMES).optional(),
	every: z.number().optional()
});

function validateTrigger(
	triggerType: AgentTriggerType,
	triggerConfig: z.infer<typeof triggerConfigSchema>
): string | null {
	if (triggerType === 'schedule') {
		if (!triggerConfig.cron) return 'Schedule trigger requires a cron expression';
		if (!isValidCron(triggerConfig.cron)) return 'Invalid cron expression';
	}
	if (triggerType === 'event' && !triggerConfig.event) {
		return 'Event trigger requires an event name';
	}
	return null;
}

export function createAgentsServer(ctx: CallerContext): McpServer {
	const server = new McpServer({ name: 'ai-chat-agents', version: '0.1.0' });

	server.registerTool(
		'list_agents',
		{
			description:
				"List the current user's agents (including built-in agents), with their triggers and status"
		},
		async () => {
			const db = getDb();
			const rows = listAgents(db, ctx.userId);
			return text(
				JSON.stringify(
					rows.map((r) => {
						const pub = toPublic(r);
						return {
							id: pub.id,
							name: pub.name,
							description: pub.description,
							triggerType: pub.triggerType,
							triggerConfig: pub.triggerConfig,
							enabled: pub.enabled,
							builtin: r.user_id === null,
							lastRunAt: pub.lastRunAt,
							nextRunAt: pub.nextRunAt
						};
					})
				)
			);
		}
	);

	server.registerTool(
		'get_agent',
		{
			description: 'Get the full configuration of one agent by id',
			inputSchema: { agentId: z.string() }
		},
		async ({ agentId }) => {
			const db = getDb();
			const agent = getAgent(db, agentId);
			if (!agent || (agent.user_id !== ctx.userId && agent.user_id !== null)) {
				return err('agent not found');
			}
			return text(JSON.stringify(toPublic(agent)));
		}
	);

	server.registerTool(
		'create_agent',
		{
			description:
				'Create a new agent for the current user. triggerType persona makes it selectable in chat; schedule requires a cron expression; event requires an event name.',
			inputSchema: {
				name: z.string(),
				description: z.string().optional(),
				systemPrompt: z.string(),
				providerId: z
					.string()
					.optional()
					.describe('Provider id (must be given together with modelId)'),
				modelId: z
					.string()
					.optional()
					.describe('Model id (must be given together with providerId)'),
				skillNames: z.array(z.string()).optional(),
				toolAllowlist: z.array(z.string()).optional(),
				triggerType: z.enum(['persona', 'schedule', 'http', 'manual', 'event']),
				triggerConfig: triggerConfigSchema.optional(),
				maxSteps: z.number().optional(),
				enabled: z.boolean().optional()
			}
		},
		async (input) => {
			const triggerConfig = input.triggerConfig ?? {};
			const triggerError = validateTrigger(input.triggerType, triggerConfig);
			if (triggerError) return err(triggerError);
			if ((input.providerId === undefined) !== (input.modelId === undefined)) {
				return err('providerId and modelId must be provided together');
			}
			const enabled = input.enabled !== false;
			const nextRunAt =
				input.triggerType === 'schedule' && enabled ? computeNextRunAt(triggerConfig.cron!) : null;
			const db = getDb();
			const agent = createAgent(db, ctx.userId, {
				name: input.name,
				description: input.description,
				systemPrompt: input.systemPrompt,
				providerId: input.providerId,
				modelId: input.modelId,
				skillNames: input.skillNames,
				toolAllowlist: input.toolAllowlist,
				triggerType: input.triggerType,
				triggerConfig,
				maxSteps: input.maxSteps,
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
				'Update an existing agent owned by the current user. Only provided fields are changed. Built-in agents cannot be modified.',
			inputSchema: {
				agentId: z.string(),
				name: z.string().optional(),
				description: z.string().optional(),
				systemPrompt: z.string().optional(),
				providerId: z.string().optional(),
				modelId: z.string().optional(),
				skillNames: z.array(z.string()).optional(),
				toolAllowlist: z.array(z.string()).optional(),
				triggerType: z.enum(['persona', 'schedule', 'http', 'manual', 'event']).optional(),
				triggerConfig: triggerConfigSchema.optional(),
				maxSteps: z.number().optional(),
				enabled: z.boolean().optional()
			}
		},
		async ({ agentId, ...patch }) => {
			const db = getDb();
			const existing = getAgent(db, agentId);
			if (!existing || (existing.user_id !== ctx.userId && existing.user_id !== null)) {
				return err('agent not found');
			}
			if (existing.user_id === null) {
				return err('built-in agents cannot be modified');
			}
			if ((patch.providerId === undefined) !== (patch.modelId === undefined)) {
				return err('providerId and modelId must be provided together');
			}
			const triggerType = (patch.triggerType ?? existing.trigger_type) as AgentTriggerType;
			const existingConfig = JSON.parse(existing.trigger_config) as Record<string, unknown>;
			const triggerConfig = { ...existingConfig, ...(patch.triggerConfig ?? {}) };
			if (
				patch.triggerType !== undefined ||
				patch.triggerConfig?.cron !== undefined ||
				patch.triggerConfig?.event !== undefined
			) {
				const triggerError = validateTrigger(triggerType, triggerConfig);
				if (triggerError) return err(triggerError);
			}
			let nextRunAt: number | null | undefined;
			if (
				patch.triggerType !== undefined ||
				patch.triggerConfig?.cron !== undefined ||
				patch.enabled !== undefined
			) {
				const enabled = patch.enabled ?? existing.enabled === 1;
				nextRunAt =
					triggerType === 'schedule' && enabled
						? computeNextRunAt(triggerConfig.cron as string)
						: null;
			}
			const updated = updateAgent(db, agentId, {
				...patch,
				triggerConfig: patch.triggerConfig !== undefined ? triggerConfig : undefined,
				...(nextRunAt !== undefined ? { nextRunAt } : {})
			});
			return text(JSON.stringify(toPublic(updated!)));
		}
	);

	server.registerTool(
		'delete_agent',
		{
			description: 'Delete an agent owned by the current user. Built-in agents cannot be deleted.',
			inputSchema: { agentId: z.string() }
		},
		async ({ agentId }) => {
			const db = getDb();
			const existing = getAgent(db, agentId);
			if (!existing || (existing.user_id !== ctx.userId && existing.user_id !== null)) {
				return err('agent not found');
			}
			if (existing.user_id === null) {
				return err('built-in agents cannot be deleted');
			}
			deleteAgent(db, agentId);
			return text(`deleted agent ${agentId}`);
		}
	);

	return server;
}
