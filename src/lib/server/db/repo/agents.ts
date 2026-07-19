import { randomUUID } from 'node:crypto';
import type { Agent, AgentTriggerConfig, AgentTriggerType } from '$lib/types.js';
import type { Db } from '../index.js';

export interface AgentRow {
	id: string;
	user_id: string | null;
	name: string;
	description: string;
	system_prompt: string;
	provider_id: string | null;
	model_id: string | null;
	skill_names: string;
	tool_allowlist: string | null;
	trigger_type: string;
	trigger_config: string;
	max_steps: number | null;
	enabled: number;
	last_run_at: number | null;
	next_run_at: number | null;
	created_at: number;
	updated_at: number;
}

export function toPublic(row: AgentRow): Agent {
	return {
		id: row.id,
		userId: row.user_id,
		name: row.name,
		description: row.description,
		systemPrompt: row.system_prompt,
		providerId: row.provider_id,
		modelId: row.model_id,
		skillNames: JSON.parse(row.skill_names) as string[],
		toolAllowlist: row.tool_allowlist ? (JSON.parse(row.tool_allowlist) as string[]) : null,
		triggerType: row.trigger_type as AgentTriggerType,
		triggerConfig: JSON.parse(row.trigger_config) as AgentTriggerConfig,
		maxSteps: row.max_steps,
		enabled: row.enabled === 1,
		lastRunAt: row.last_run_at,
		nextRunAt: row.next_run_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

export interface CreateAgentInput {
	name: string;
	description?: string;
	systemPrompt: string;
	providerId?: string | null;
	modelId?: string | null;
	skillNames?: string[];
	toolAllowlist?: string[] | null;
	triggerType: AgentTriggerType;
	triggerConfig?: AgentTriggerConfig;
	maxSteps?: number | null;
	enabled?: boolean;
	nextRunAt?: number | null;
}

export function createAgent(db: Db, userId: string | null, input: CreateAgentInput): AgentRow {
	const id = randomUUID();
	const now = Date.now();
	db.prepare(
		`INSERT INTO agents (id, user_id, name, description, system_prompt, provider_id, model_id,
		 skill_names, tool_allowlist, trigger_type, trigger_config, max_steps, enabled, next_run_at,
		 created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		id,
		userId,
		input.name,
		input.description ?? '',
		input.systemPrompt,
		input.providerId ?? null,
		input.modelId ?? null,
		JSON.stringify(input.skillNames ?? []),
		input.toolAllowlist != null ? JSON.stringify(input.toolAllowlist) : null,
		input.triggerType,
		JSON.stringify(input.triggerConfig ?? {}),
		input.maxSteps ?? null,
		input.enabled === false ? 0 : 1,
		input.nextRunAt ?? null,
		now,
		now
	);
	return getAgent(db, id)!;
}

export function getAgent(db: Db, id: string): AgentRow | undefined {
	return db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as AgentRow | undefined;
}

export function listAgents(db: Db, userId: string): AgentRow[] {
	return db
		.prepare(
			`SELECT * FROM agents
			 WHERE user_id = ? OR user_id IS NULL
			 ORDER BY user_id IS NULL, name`
		)
		.all(userId) as AgentRow[];
}

export function listPersonaAgents(db: Db, userId: string): AgentRow[] {
	return db
		.prepare(
			`SELECT * FROM agents
			 WHERE (user_id = ? OR user_id IS NULL) AND trigger_type = 'persona' AND enabled = 1
			 ORDER BY user_id IS NULL, name`
		)
		.all(userId) as AgentRow[];
}

export function listDueScheduleAgents(db: Db, now: number): AgentRow[] {
	return db
		.prepare(
			`SELECT * FROM agents
			 WHERE trigger_type = 'schedule' AND enabled = 1
			   AND next_run_at IS NOT NULL AND next_run_at <= ?
			   AND user_id IS NOT NULL
			   AND NOT EXISTS (
			       SELECT 1 FROM agent_runs
			       WHERE agent_runs.agent_id = agents.id AND agent_runs.status = 'running'
			   )`
		)
		.all(now) as AgentRow[];
}

export interface UpdateAgentInput {
	name?: string;
	description?: string;
	systemPrompt?: string;
	providerId?: string | null;
	modelId?: string | null;
	skillNames?: string[];
	toolAllowlist?: string[] | null;
	triggerType?: AgentTriggerType;
	triggerConfig?: AgentTriggerConfig;
	maxSteps?: number | null;
	enabled?: boolean;
	nextRunAt?: number | null;
	lastRunAt?: number | null;
}

export function updateAgent(db: Db, id: string, patch: UpdateAgentInput): AgentRow | undefined {
	const existing = getAgent(db, id);
	if (!existing) return undefined;
	db.prepare(
		`UPDATE agents SET name = ?, description = ?, system_prompt = ?, provider_id = ?, model_id = ?,
		 skill_names = ?, tool_allowlist = ?, trigger_type = ?, trigger_config = ?, max_steps = ?,
		 enabled = ?, next_run_at = ?, last_run_at = ?, updated_at = ?
		 WHERE id = ?`
	).run(
		patch.name ?? existing.name,
		patch.description ?? existing.description,
		patch.systemPrompt ?? existing.system_prompt,
		patch.providerId !== undefined ? patch.providerId : existing.provider_id,
		patch.modelId !== undefined ? patch.modelId : existing.model_id,
		patch.skillNames !== undefined ? JSON.stringify(patch.skillNames) : existing.skill_names,
		patch.toolAllowlist !== undefined
			? patch.toolAllowlist != null
				? JSON.stringify(patch.toolAllowlist)
				: null
			: existing.tool_allowlist,
		patch.triggerType ?? existing.trigger_type,
		patch.triggerConfig !== undefined
			? JSON.stringify(patch.triggerConfig)
			: existing.trigger_config,
		patch.maxSteps !== undefined ? patch.maxSteps : existing.max_steps,
		patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : existing.enabled,
		patch.nextRunAt !== undefined ? patch.nextRunAt : existing.next_run_at,
		patch.lastRunAt !== undefined ? patch.lastRunAt : existing.last_run_at,
		Date.now(),
		id
	);
	return getAgent(db, id);
}

export function deleteAgent(db: Db, id: string): boolean {
	return db.prepare('DELETE FROM agents WHERE id = ?').run(id).changes > 0;
}

export function setAgentRunTimes(
	db: Db,
	id: string,
	times: { lastRunAt?: number | null; nextRunAt?: number | null }
): void {
	const existing = getAgent(db, id);
	if (!existing) return;
	db.prepare('UPDATE agents SET last_run_at = ?, next_run_at = ? WHERE id = ?').run(
		times.lastRunAt !== undefined ? times.lastRunAt : existing.last_run_at,
		times.nextRunAt !== undefined ? times.nextRunAt : existing.next_run_at,
		id
	);
}

export function claimAgentRun(
	db: Db,
	id: string,
	expectedNextRunAt: number | null,
	newNextRunAt: number | null
): boolean {
	return (
		db
			.prepare('UPDATE agents SET next_run_at = ? WHERE id = ? AND next_run_at IS ?')
			.run(newNextRunAt, id, expectedNextRunAt).changes === 1
	);
}
