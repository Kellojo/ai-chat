import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDb } from '../../db/index.js';
import { searchConversations } from '../../db/repo/conversations.js';
import type { CallerContext } from '../types.js';
import { err, text } from './shared.js';

export function createChatSearchServer(ctx: CallerContext): McpServer {
	const server = new McpServer({ name: 'ai-chat-chat-search', version: '0.1.0' });
	server.registerTool(
		'search_chats',
		{
			description: "Search the current user's chat conversations by title and message content",
			inputSchema: { query: z.string(), limit: z.number().int().optional() }
		},
		async ({ query, limit }) => {
			if (!query.trim()) return err('query must not be empty');
			const n = Math.min(50, Math.max(1, Math.floor(limit ?? 10)));
			const rows = searchConversations(getDb(), ctx.userId, query).slice(0, n);
			return text(
				JSON.stringify(rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at })))
			);
		}
	);
	return server;
}
