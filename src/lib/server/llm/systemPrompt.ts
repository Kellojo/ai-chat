import type { ConversationRow } from '../db/repo/conversations.js';

const BASE_PROMPT = 'You are a helpful assistant. Answer concisely and use markdown formatting.';

export function buildSystemPrompt(conversation: ConversationRow, globalInstructions = ''): string {
	const base = conversation.system_prompt ?? BASE_PROMPT;
	const extra = globalInstructions.trim();
	if (!extra) return base;
	return `${base}\n\n${extra}`;
}
