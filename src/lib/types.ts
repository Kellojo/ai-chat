import type { UIMessage } from 'ai';

export type { UIMessage };

export interface Provider {
	id: string;
	name: string;
	type: 'anthropic' | 'openai-compatible';
	baseUrl: string | null;
	hasApiKey: boolean;
	enabled: boolean;
	createdAt: number;
}

export interface ChatModel {
	id: string;
	providerId: string;
	modelId: string;
	displayName: string;
	capabilities: string[];
	enabled: boolean;
}

export type ModelRole = 'chat' | 'title' | 'memory' | 'research';

export type RoleDefaults = Partial<Record<ModelRole, string>>;

export interface ModelsByProvider {
	provider: Provider;
	models: ChatModel[];
}

export interface McpServerInfo {
	id: string;
	name: string;
	transport: 'builtin' | 'stdio' | 'http' | 'sse';
	url: string | null;
	hasToken: boolean;
	enabled: boolean;
	scopes: ('chat' | 'agent')[];
	builtin: boolean;
}

export interface Conversation {
	id: string;
	kind: 'chat' | 'agent-run' | 'research';
	title: string;
	mode: 'chat' | 'agent';
	providerId: string | null;
	modelId: string | null;
	systemPrompt: string | null;
	memoryEnabled: boolean;
	maxSteps: number | null;
	temperature: number | null;
	maxTokens: number | null;
	pinned: boolean;
	agentId: string | null;
	createdAt: number;
	updatedAt: number;
}

export type AgentTriggerType = 'persona' | 'schedule' | 'http' | 'manual';

export interface AgentTriggerConfig {
	cron?: string;
	instructions?: string;
}

export interface Agent {
	id: string;
	userId: string | null;
	name: string;
	description: string;
	systemPrompt: string;
	providerId: string | null;
	modelId: string | null;
	skillNames: string[];
	toolAllowlist: string[] | null;
	triggerType: AgentTriggerType;
	triggerConfig: AgentTriggerConfig;
	maxSteps: number | null;
	enabled: boolean;
	lastRunAt: number | null;
	nextRunAt: number | null;
	createdAt: number;
	updatedAt: number;
}

export type AgentRunTrigger = 'schedule' | 'http' | 'manual' | 'chat';

export type AgentRunStatus = 'running' | 'success' | 'failed';

export interface AgentRun {
	id: string;
	agentId: string;
	userId: string;
	trigger: AgentRunTrigger;
	status: AgentRunStatus;
	conversationId: string | null;
	error: string | null;
	startedAt: number;
	endedAt: number | null;
}

export interface ApiKey {
	id: string;
	label: string;
	scopes: string[];
	createdAt: number;
	lastUsedAt: number | null;
}

export interface ChatMessage {
	id: string;
	conversationId: string;
	role: 'user' | 'assistant' | 'system';
	parts: unknown[];
	status: 'complete' | 'partial' | 'failed';
	error: string | null;
	createdAt: number;
}

export function chatMessageToUIMessage(message: ChatMessage): UIMessage {
	return {
		id: message.id,
		role: message.role,
		parts: message.parts as UIMessage['parts']
	};
}
