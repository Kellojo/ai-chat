import type { ModelMessage } from 'ai';
import { compressVercelMessages } from 'headroom-ai/vercel-ai';
import { getHeadroomProxyUrl, isHeadroomProxyRunning, startHeadroomProxy } from './headroom-proxy.js';

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
		// Ensure proxy is running
		const started = await startHeadroomProxy();
		if (!started || !isHeadroomProxyRunning()) {
			return null;
		}

		const result = await compressVercelMessages(messages, {
			model,
			baseUrl: getHeadroomProxyUrl(),
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
