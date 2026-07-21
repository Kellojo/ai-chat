import { handleChatCompletions } from '$lib/server/proxy/handler.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) => handleChatCompletions(request);
