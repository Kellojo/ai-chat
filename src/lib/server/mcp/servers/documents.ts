import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CallerContext } from '../types.js';
import { err, looksTextual, resolveInside, text, toPosix, walk } from './shared.js';

const MAX_READ = 1024 * 1024;
const MAX_SCAN = 5 * 1024 * 1024;

export function createDocumentsServer(ctx: CallerContext): McpServer {
	const server = new McpServer({ name: 'ai-chat-documents', version: '0.1.0' });
	const root = ctx.documentsDir;
	const setup = (): void => {
		fs.mkdirSync(root, { recursive: true });
	};

	server.registerTool(
		'create_document',
		{
			description: 'Create a new document in the documents volume; fails if it already exists',
			inputSchema: { path: z.string(), content: z.string() }
		},
		async ({ path: rel, content }) => {
			setup();
			const abs = resolveInside(root, rel);
			if (!abs) return err('path escapes documents root');
			if (fs.existsSync(abs)) return err(`document already exists: ${rel}`);
			fs.mkdirSync(path.dirname(abs), { recursive: true });
			fs.writeFileSync(abs, content, 'utf-8');
			return text(`created ${toPosix(rel)}`);
		}
	);

	server.registerTool(
		'read_document',
		{
			description: 'Read a document from the documents volume',
			inputSchema: { path: z.string() }
		},
		async ({ path: rel }) => {
			setup();
			const abs = resolveInside(root, rel);
			if (!abs) return err('path escapes documents root');
			if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
				return err(`document not found: ${rel}`);
			}
			return text(fs.readFileSync(abs).subarray(0, MAX_READ).toString('utf-8'));
		}
	);

	server.registerTool(
		'update_document',
		{
			description: 'Overwrite an existing document in the documents volume',
			inputSchema: { path: z.string(), content: z.string() }
		},
		async ({ path: rel, content }) => {
			setup();
			const abs = resolveInside(root, rel);
			if (!abs) return err('path escapes documents root');
			if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
				return err(`document not found: ${rel}`);
			}
			fs.writeFileSync(abs, content, 'utf-8');
			return text(`updated ${toPosix(rel)}`);
		}
	);

	server.registerTool(
		'delete_document',
		{
			description: 'Delete a document from the documents volume',
			inputSchema: { path: z.string() }
		},
		async ({ path: rel }) => {
			setup();
			const abs = resolveInside(root, rel);
			if (!abs) return err('path escapes documents root');
			if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
				return err(`document not found: ${rel}`);
			}
			fs.unlinkSync(abs);
			return text(`deleted ${toPosix(rel)}`);
		}
	);

	server.registerTool(
		'list_documents',
		{
			description: 'List documents in the documents volume, optionally under a prefix',
			inputSchema: { prefix: z.string().optional() }
		},
		async ({ prefix }) => {
			setup();
			let base = root;
			if (prefix) {
				const abs = resolveInside(root, prefix);
				if (!abs) return err('path escapes documents root');
				base = abs;
			}
			if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) return text('[]');
			const entries = walk(base)
				.filter((e) => !e.isDir)
				.map((e) => ({ path: toPosix(path.relative(root, e.abs)), size: fs.statSync(e.abs).size }));
			return text(JSON.stringify(entries));
		}
	);

	server.registerTool(
		'search_documents',
		{
			description:
				'Case-insensitive substring search over textual documents in the documents volume',
			inputSchema: { query: z.string(), limit: z.number().int().optional() }
		},
		async ({ query, limit }) => {
			setup();
			if (!query) return err('query must not be empty');
			const n = Math.min(100, Math.max(1, Math.floor(limit ?? 20)));
			const q = query.toLowerCase();
			const hits: Array<{ path: string; snippet: string }> = [];
			for (const e of walk(root)) {
				if (hits.length >= n) break;
				if (e.isDir || !looksTextual(e.abs, MAX_SCAN)) continue;
				const body = fs.readFileSync(e.abs, 'utf-8');
				const i = body.toLowerCase().indexOf(q);
				if (i === -1) continue;
				const start = Math.max(0, i - 40);
				hits.push({ path: e.rel, snippet: body.slice(start, i + query.length + 40).trim() });
			}
			return text(JSON.stringify(hits));
		}
	);

	return server;
}
