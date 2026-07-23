import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

function root(): string {
	return path.resolve(config.WORKSPACES_VOLUME);
}

function safeJoin(...segments: string[]): string {
	const resolved = path.resolve(root(), ...segments);
	if (resolved !== root() && !resolved.startsWith(root() + path.sep)) {
		throw new Error('Path escapes workspace root');
	}
	return resolved;
}

export function conversationWorkspace(conversationId: string): string {
	return safeJoin(conversationId);
}

export function ensureAttachmentsDir(conversationId: string): string {
	const dir = safeJoin(conversationId, 'attachments');
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

export function resolveAttachment(storedPath: string): string {
	const resolved = safeJoin(storedPath);
	if (!fs.existsSync(resolved)) throw new Error('Attachment not found on disk');
	return resolved;
}

export function agentWorkspaceName(agentId: string, runId: string): string {
	return `agent-${agentId}-${runId}`;
}

export function agentWorkspace(agentId: string, runId: string): string {
	return safeJoin(agentWorkspaceName(agentId, runId));
}

export function ensureAgentWorkspace(agentId: string, runId: string): string {
	const dir = agentWorkspace(agentId, runId);
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

export function gcAgentWorkspaces(olderThanDays: number): string[] {
	const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
	const removed: string[] = [];
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(root(), { withFileTypes: true });
	} catch {
		return removed;
	}
	for (const entry of entries) {
		if (!entry.isDirectory() || !entry.name.startsWith('agent-')) continue;
		const dir = safeJoin(entry.name);
		try {
			if (fs.statSync(dir).mtimeMs >= cutoff) continue;
			fs.rmSync(dir, { recursive: true, force: true });
			removed.push(entry.name);
		} catch {
			// ignore individual failures
		}
	}
	return removed;
}

export function removeConversationWorkspace(conversationId: string): void {
	try {
		fs.rmSync(conversationWorkspace(conversationId), { recursive: true, force: true });
	} catch {
		// ignore individual failures
	}
}

export function gcOrphanConversationWorkspaces(validIds: Set<string>): string[] {
	const removed: string[] = [];
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(root(), { withFileTypes: true });
	} catch {
		return removed;
	}
	for (const entry of entries) {
		if (!entry.isDirectory() || entry.name.startsWith('agent-')) continue;
		if (validIds.has(entry.name)) continue;
		try {
			fs.rmSync(safeJoin(entry.name), { recursive: true, force: true });
			removed.push(entry.name);
		} catch {
			// ignore individual failures
		}
	}
	return removed;
}

export function sanitizeFilename(name: string): string {
	const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
	return base.length > 0 && base !== '.' && base !== '..' ? base.slice(0, 120) : 'file';
}
