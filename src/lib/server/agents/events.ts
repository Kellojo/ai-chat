import {
	AGENT_EVENT_NAMES,
	type AgentEventName,
	type AgentTriggerConfig,
	type ServerEvent
} from '$lib/types.js';
import { getDb, type Db } from '../db/index.js';
import { listRunningAgentIds } from '../db/repo/agent-runs.js';
import {
	incrementAgentEventCounter,
	listEventAgents,
	listOverridesForAgent
} from '../db/repo/agents.js';
import { subscribeAllServerEvents } from '../events/bus.js';

export async function emitAgentEvent(
	event: AgentEventName,
	userId: string,
	payload: Record<string, unknown>,
	db: Db = getDb(),
	runFn?: (agentId: string, userId: string, instructions: string) => Promise<unknown>
): Promise<void> {
	try {
		const run =
			runFn ??
			((agentId: string, uid: string, instructions: string) =>
				import('./runner.js')
					.then((m) => m.startAgentRun({ agentId, trigger: 'event', userId: uid, instructions }))
					.then((s) => s.done));
		for (const agent of listEventAgents(db, event)) {
			try {
				if (agent.user_id !== null && agent.user_id !== userId) continue;
				if (agent.user_id === null) {
					const enabled = listOverridesForAgent(db, agent.id).get(userId) ?? agent.enabled === 1;
					if (!enabled) continue;
				}
				if (listRunningAgentIds(db, [agent.id]).length > 0) continue;
				const count = incrementAgentEventCounter(db, agent.id, userId, event);
				let triggerConfig: AgentTriggerConfig = {};
				try {
					triggerConfig = JSON.parse(agent.trigger_config) as AgentTriggerConfig;
				} catch {
					triggerConfig = {};
				}
				const rawEvery = triggerConfig.every;
				const every =
					typeof rawEvery === 'number' && Number.isFinite(rawEvery)
						? Math.max(1, Math.trunc(rawEvery))
						: 1;
				if (count % every !== 0) continue;
				const payloadJson = JSON.stringify(payload);
				const instructions = triggerConfig.instructions
					? `${triggerConfig.instructions}\n\nTriggering event: "${event}" (occurrence #${count}). Payload: ${payloadJson}`
					: `The event "${event}" just occurred (occurrence #${count}). Payload: ${payloadJson}. Act on it according to your role.`;
				await run(agent.id, userId, instructions);
			} catch (e) {
				console.error(`Event run of agent ${agent.id} failed`, e);
			}
		}
	} catch (e) {
		console.error(`Failed to emit agent event ${event}`, e);
	}
}

export function handleServerEvent(
	userId: string,
	event: ServerEvent,
	db: Db = getDb(),
	runFn?: (agentId: string, userId: string, instructions: string) => Promise<unknown>
): void {
	if (!(AGENT_EVENT_NAMES as readonly string[]).includes(event.type)) return;
	const { type, ...payload } = event;
	void emitAgentEvent(type as AgentEventName, userId, payload, db, runFn);
}

export function startAgentEventDispatcher(): void {
	const globalFlag = globalThis as { __agentEventDispatcherStarted?: boolean };
	if (globalFlag.__agentEventDispatcherStarted) return;
	globalFlag.__agentEventDispatcherStarted = true;
	subscribeAllServerEvents((userId, event) => handleServerEvent(userId, event));
}
