import { randomUUID } from 'node:crypto';
import {
	convertToModelMessages,
	readUIMessageStream,
	stepCountIs,
	streamText,
	type UIMessage
} from 'ai';
import type { AgentTriggerConfig } from '$lib/types.js';
import { config } from '../config.js';
import { getDb, type Db } from '../db/index.js';
import { getAgent, setAgentRunTimes } from '../db/repo/agents.js';
import {
	createAgentRun,
	finishAgentRun,
	getAgentRun,
	type AgentRunRow
} from '../db/repo/agent-runs.js';
import { createConversation } from '../db/repo/conversations.js';
import { createMessage, updateMessage } from '../db/repo/messages.js';
import { findRoleModel } from '../db/repo/models.js';
import { resolveModel } from '../llm/registry.js';
import { buildTools } from '../tools/registry.js';
import { ensureAgentWorkspace } from '../workspaces.js';

export interface StartAgentRunInput {
	agentId: string;
	trigger: 'schedule' | 'http' | 'manual' | 'event';
	userId: string;
	instructions?: string;
}

export interface StartedAgentRun {
	run: AgentRunRow;
	done: Promise<AgentRunRow>;
}

const runControllers = new Map<string, AbortController>();

export function stopAgentRun(runId: string): boolean {
	const controller = runControllers.get(runId);
	if (!controller) return false;
	controller.abort(new Error('Stopped by user'));
	return true;
}

export async function startAgentRun(
	input: StartAgentRunInput,
	db: Db = getDb()
): Promise<StartedAgentRun> {
	const agent = getAgent(db, input.agentId);
	if (!agent) throw new Error('Agent not found');

	let ref: { providerId: string; modelId: string };
	if (agent.provider_id && agent.model_id) {
		ref = { providerId: agent.provider_id, modelId: agent.model_id };
	} else {
		const roleDefault =
			agent.user_id === null
				? (findRoleModel(db, 'memory') ?? findRoleModel(db, 'chat'))
				: findRoleModel(db, 'chat');
		if (!roleDefault) {
			throw new Error('Agent has no model configured and no default chat model exists');
		}
		ref = { providerId: roleDefault.provider_id, modelId: roleDefault.model_id };
	}
	const model = resolveModel(ref);

	const conversation = createConversation(db, input.userId, {
		kind: 'agent-run',
		mode: 'agent',
		title: `${agent.name} · ${input.trigger} run`,
		providerId: ref.providerId,
		modelId: ref.modelId,
		agentId: agent.id
	});
	const run = createAgentRun(db, {
		agentId: agent.id,
		userId: input.userId,
		trigger: input.trigger,
		conversationId: conversation.id
	});
	const workspaceDir = ensureAgentWorkspace(agent.id, run.id);

	const triggerConfig = JSON.parse(agent.trigger_config) as AgentTriggerConfig;
	const instructions =
		input.instructions ??
		triggerConfig.instructions ??
		(agent.user_id === null
			? `Review conversations updated since ${new Date(agent.last_run_at ?? 0).toISOString()} and distill durable long-term memory from them. Use search_chats with the "since" parameter to list them, read_chat to review their contents, list_concepts/search_memory to check what already exists, then create_concept/update_concept to persist.`
			: `Execute your task now. Trigger: ${input.trigger}.`);
	const uiUserMessage: UIMessage = {
		id: randomUUID(),
		role: 'user',
		parts: [{ type: 'text', text: instructions }]
	};
	createMessage(db, {
		id: uiUserMessage.id,
		conversationId: conversation.id,
		role: 'user',
		parts: uiUserMessage.parts,
		status: 'complete'
	});

	const system = `${agent.system_prompt}\n\n---\nYou are running autonomously as the agent "${agent.name}" (trigger: ${input.trigger}). Current time: ${new Date().toLocaleString('en-US', { timeZone: config.TZ })} (${config.TZ}). Do not ask the user questions; no one is watching live.`;

	const { tools, close } = await buildTools({
		userId: input.userId,
		mode: 'agent',
		memoryEnabled: true,
		workspaceDir,
		agentAllowlist: agent.tool_allowlist
			? (JSON.parse(agent.tool_allowlist) as string[])
			: undefined,
		author: agent.user_id === null ? 'system' : `agent:${agent.id}`,
		conversationId: conversation.id,
		agentRunId: run.id
	});

	const controller = new AbortController();
	runControllers.set(run.id, controller);

	const done = (async (): Promise<AgentRunRow> => {
		let errorText: string | null = null;
		const assistantMessageIds: string[] = [];
		try {
			const result = streamText({
				model,
				system,
				messages: await convertToModelMessages([uiUserMessage]),
				tools,
				stopWhen: stepCountIs(agent.max_steps ?? config.AGENT_MAX_STEPS),
				maxRetries: 2,
				abortSignal: controller.signal,
				onError: ({ error }) => {
					errorText = error instanceof Error ? error.message : String(error);
				}
			});
			for await (const message of readUIMessageStream({
				stream: result.toUIMessageStream({
					originalMessages: [uiUserMessage],
					generateMessageId: () => randomUUID()
				})
			})) {
				if (!assistantMessageIds.includes(message.id)) {
					assistantMessageIds.push(message.id);
					createMessage(db, {
						id: message.id,
						conversationId: conversation.id,
						role: 'assistant',
						parts: message.parts,
						status: 'partial'
					});
				} else {
					updateMessage(db, message.id, { parts: message.parts });
				}
			}
		} catch (e) {
			if (!errorText) errorText = e instanceof Error ? e.message : String(e);
		} finally {
			if (controller.signal.aborted) errorText = 'Stopped by user';
			runControllers.delete(run.id);
			for (const id of assistantMessageIds) {
				updateMessage(db, id, {
					status: errorText ? 'failed' : 'complete',
					error: errorText
				});
			}
			finishAgentRun(db, run.id, errorText ? 'failed' : 'success', errorText);
			setAgentRunTimes(db, agent.id, { lastRunAt: Date.now() });
			await close();
		}
		return getAgentRun(db, run.id)!;
	})().catch((e) => {
		console.error('Agent run failed unexpectedly', e);
		try {
			finishAgentRun(db, run.id, 'failed', e instanceof Error ? e.message : String(e));
		} catch {
			// run row may already be finalized
		}
		return getAgentRun(db, run.id)!;
	});

	return { run, done };
}
