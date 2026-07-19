import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { CallerContext } from '../types.js';
import { err, looksTextual, resolveInside, text, toPosix, walk } from './shared.js';

const MAX_OUT = 64 * 1024;
const MAX_FILE = 1024 * 1024;
const MAX_SCAN = 5 * 1024 * 1024;
const MAX_MATCHES = 200;
const MAX_GLOB = 500;

function cap(out: string): string {
	return out.length > MAX_OUT ? `${out.slice(0, MAX_OUT)}\n… truncated` : out;
}

function globToRegExp(glob: string): RegExp {
	const g = glob.replace(/\\/g, '/');
	let out = '';
	for (let i = 0; i < g.length; i++) {
		const c = g[i];
		if (c === '*') {
			if (g[i + 1] === '*') {
				i++;
				if (g[i + 1] === '/') {
					i++;
					out += '(?:.*/)?';
				} else {
					out += '.*';
				}
			} else {
				out += '[^/]*';
			}
		} else if (c === '?') {
			out += '[^/]';
		} else {
			out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
		}
	}
	return new RegExp(`^${out}$`);
}

export function createBashServer(ctx: CallerContext): McpServer {
	const server = new McpServer({ name: 'ai-chat-bash', version: '0.1.0' });

	function workspace(): string | CallToolResult {
		if (!ctx.workspaceDir) return err('no workspace available');
		fs.mkdirSync(ctx.workspaceDir, { recursive: true });
		return ctx.workspaceDir;
	}

	function resolveIn(ws: string, rel: string): string | CallToolResult {
		const abs = resolveInside(ws, rel);
		return abs ?? err('path escapes workspace');
	}

	server.registerTool(
		'ls',
		{
			description: 'List directory contents in the workspace, directories first',
			inputSchema: { path: z.string().optional() }
		},
		async ({ path: rel }) => {
			const ws = workspace();
			if (typeof ws !== 'string') return ws;
			const abs = resolveIn(ws, rel ?? '.');
			if (typeof abs !== 'string') return abs;
			let entries: fs.Dirent[];
			try {
				entries = fs.readdirSync(abs, { withFileTypes: true });
			} catch {
				return err(`not a directory: ${rel ?? '.'}`);
			}
			const dirs = entries
				.filter((e) => e.isDirectory())
				.map((e) => `${e.name}/`)
				.sort();
			const files = entries
				.filter((e) => !e.isDirectory())
				.map((e) => e.name)
				.sort();
			return text(cap([...dirs, ...files].join('\n')));
		}
	);

	server.registerTool(
		'cat',
		{
			description: 'Print a workspace file',
			inputSchema: { path: z.string() }
		},
		async ({ path: rel }) => {
			const ws = workspace();
			if (typeof ws !== 'string') return ws;
			const abs = resolveIn(ws, rel);
			if (typeof abs !== 'string') return abs;
			if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return err(`not a file: ${rel}`);
			const buf = fs.readFileSync(abs);
			if (buf.length > MAX_FILE) {
				return text(`${buf.subarray(0, MAX_FILE).toString('utf-8')}\n… truncated`);
			}
			return text(cap(buf.toString('utf-8')));
		}
	);

	const headTail =
		(tail: boolean) =>
		async ({ path: rel, lines }: { path: string; lines?: number }) => {
			const ws = workspace();
			if (typeof ws !== 'string') return ws;
			const abs = resolveIn(ws, rel);
			if (typeof abs !== 'string') return abs;
			if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return err(`not a file: ${rel}`);
			const n = Math.max(0, Math.floor(lines ?? 40));
			const all = fs.readFileSync(abs, 'utf-8').split(/\r?\n/);
			const slice = tail ? all.slice(Math.max(0, all.length - n)) : all.slice(0, n);
			return text(cap(slice.join('\n')));
		};

	server.registerTool(
		'head',
		{
			description: 'Print the first lines of a workspace file',
			inputSchema: { path: z.string(), lines: z.number().int().optional() }
		},
		headTail(false)
	);

	server.registerTool(
		'tail',
		{
			description: 'Print the last lines of a workspace file',
			inputSchema: { path: z.string(), lines: z.number().int().optional() }
		},
		headTail(true)
	);

	server.registerTool(
		'wc',
		{
			description: 'Count lines, words and bytes of a workspace file',
			inputSchema: { path: z.string() }
		},
		async ({ path: rel }) => {
			const ws = workspace();
			if (typeof ws !== 'string') return ws;
			const abs = resolveIn(ws, rel);
			if (typeof abs !== 'string') return abs;
			if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return err(`not a file: ${rel}`);
			const buf = fs.readFileSync(abs);
			const content = buf.toString('utf-8');
			const lines = content === '' ? 0 : (content.match(/\n/g)?.length ?? 0);
			const words = content.split(/\s+/).filter(Boolean).length;
			return text(`${lines} ${words} ${buf.length} ${toPosix(rel)}`);
		}
	);

	server.registerTool(
		'grep',
		{
			description: 'Search workspace files with a regular expression',
			inputSchema: {
				pattern: z.string(),
				path: z.string().optional(),
				ignoreCase: z.boolean().optional()
			}
		},
		async ({ pattern, path: rel, ignoreCase }) => {
			const ws = workspace();
			if (typeof ws !== 'string') return ws;
			let re: RegExp;
			try {
				re = new RegExp(pattern, ignoreCase ? 'i' : '');
			} catch (e) {
				return err(`invalid regex: ${e instanceof Error ? e.message : String(e)}`);
			}
			const abs = resolveIn(ws, rel ?? '.');
			if (typeof abs !== 'string') return abs;
			if (!fs.existsSync(abs)) return err(`path not found: ${rel ?? '.'}`);
			const targets: Array<{ abs: string; rel: string }> = [];
			if (fs.statSync(abs).isFile()) {
				targets.push({ abs, rel: toPosix(path.relative(ws, abs)) });
			} else {
				for (const e of walk(abs)) {
					if (!e.isDir && looksTextual(e.abs, MAX_SCAN)) {
						targets.push({ abs: e.abs, rel: toPosix(path.relative(ws, e.abs)) });
					}
				}
			}
			const out: string[] = [];
			for (const t of targets) {
				if (out.length >= MAX_MATCHES) break;
				const lines = fs.readFileSync(t.abs, 'utf-8').split(/\r?\n/);
				for (let i = 0; i < lines.length && out.length < MAX_MATCHES; i++) {
					if (re.test(lines[i])) out.push(`${t.rel}:${i + 1}:${lines[i]}`);
				}
			}
			return text(cap(out.join('\n')));
		}
	);

	server.registerTool(
		'glob',
		{
			description: 'Match workspace paths against a glob pattern (* and ** supported)',
			inputSchema: { pattern: z.string() }
		},
		async ({ pattern }) => {
			const ws = workspace();
			if (typeof ws !== 'string') return ws;
			const matches: string[] = [];
			if (typeof fs.promises.glob === 'function') {
				for await (const p of fs.promises.glob(pattern.replace(/\\/g, '/'), { cwd: ws })) {
					const posix = toPosix(String(p));
					if (posix === '.') continue;
					matches.push(posix);
					if (matches.length >= MAX_GLOB) break;
				}
			} else {
				const re = globToRegExp(pattern);
				for (const e of walk(ws)) {
					if (re.test(e.rel)) matches.push(e.rel);
					if (matches.length >= MAX_GLOB) break;
				}
			}
			matches.sort();
			return text(JSON.stringify(matches));
		}
	);

	return server;
}
