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
	isDefaultFor: 'chat' | 'memory' | 'research' | null;
}

export interface ModelsByProvider {
	provider: Provider;
	models: ChatModel[];
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
	createdAt: number;
	updatedAt: number;
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
