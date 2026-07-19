import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { config } from '../../config.js';
import { getDb } from '../../db/index.js';
import { getAllSettings, getSetting, setSetting } from '../../db/repo/settings.js';
import type { CallerContext } from '../types.js';
import { err, text } from './shared.js';

export function createSettingsServer(ctx: CallerContext): McpServer {
	const server = new McpServer({ name: 'ai-chat-settings', version: '0.1.0' });

	server.registerTool(
		'get_setting',
		{
			description: 'Read an application setting by key',
			inputSchema: { key: z.string() }
		},
		async ({ key }) => {
			const value = getSetting(getDb(), key);
			if (value === undefined) return err(`unknown setting: ${key}`);
			return text(JSON.stringify(value));
		}
	);

	server.registerTool(
		'list_settings',
		{
			description: 'List all application settings'
		},
		async () => text(JSON.stringify(getAllSettings(getDb())))
	);

	server.registerTool(
		'update_setting',
		{
			description:
				'Update an application setting (requires an admin user and SETTINGS_MCP_WRITE=true)',
			inputSchema: { key: z.string(), value: z.unknown() }
		},
		async ({ key, value }) => {
			if (!config.SETTINGS_MCP_WRITE) {
				return err('update_setting is disabled (SETTINGS_MCP_WRITE=false)');
			}
			if (ctx.role !== 'admin') return err('update_setting requires an admin user');
			setSetting(getDb(), key, value);
			return text(`updated ${key}`);
		}
	);

	return server;
}
