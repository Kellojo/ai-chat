import type { ConversationRow } from '../db/repo/conversations.js';

const BASE_PROMPT = 'You are a helpful assistant. Answer concisely and use markdown formatting.';

export function buildSystemPrompt(conversation: ConversationRow): string {
	if (conversation.system_prompt) return conversation.system_prompt;
	return BASE_PROMPT;
}
