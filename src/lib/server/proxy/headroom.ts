import type { ModelMessage } from 'ai';
import { compressVercelMessages } from 'headroom-ai/vercel-ai';

export interface HeadroomResult {
	messages: ModelMessage[];
	before: number;
	after: number;
}

export async function applyHeadroom(
	messages: ModelMessage[],
	model: string
): Promise<HeadroomResult | null> {
	try {
		const result = await compressVercelMessages(messages, {
			model,
			baseUrl: process.env.HEADROOM_BASE_URL,
			apiKey: process.env.HEADROOM_API_KEY,
			fallback: true
		});
		return {
			messages: result.messages as ModelMessage[],
			before: result.tokensBefore,
			after: result.tokensAfter
		};
	} catch {
		return null;
	}
}
