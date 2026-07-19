import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallerContext } from '../types.js';
import { createWebfetchServer } from './webfetch.js';
import { createDatetimeServer } from './datetime.js';
import { createChatSearchServer } from './chat-search.js';
import { createDocumentsServer } from './documents.js';
import { createBashServer } from './bash.js';
import { createSettingsServer } from './settings.js';

export type BuiltinServerFactory = (ctx: CallerContext) => McpServer;

export const BUILTIN_SERVERS: Record<string, BuiltinServerFactory> = {
	webfetch: createWebfetchServer,
	datetime: createDatetimeServer,
	'chat-search': createChatSearchServer,
	documents: createDocumentsServer,
	bash: createBashServer,
	settings: createSettingsServer
};
