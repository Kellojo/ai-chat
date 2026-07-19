import { generateText } from 'ai';
import { getDb } from '../db/index.js';
import { setConversationTitle } from '../db/repo/conversations.js';
import { resolveModel } from '../llm/registry.js';

export async function generateConversationTitle(
	conversationId: string,
	ref: { providerId: string; modelId: string },
	userText: string,
	assistantText: string
): Promise<void> {
	const prompt = [
		'Write a short conversation title (3-6 words, plain text, no quotes, no trailing punctuation) for this exchange.',
		'',
		`User: ${userText.slice(0, 500)}`,
		`Assistant: ${assistantText.slice(0, 500)}`
	].join('\n');
	const result = await generateText({
		model: resolveModel(ref),
		prompt,
		maxOutputTokens: 30
	});
	const title = result.text.trim().replace(/^["']|["']$/g, '').slice(0, 80);
	if (title) {
		setConversationTitle(getDb(), conversationId, title);
	}
}
