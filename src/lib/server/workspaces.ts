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

export function sanitizeFilename(name: string): string {
	const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
	return base.length > 0 && base !== '.' && base !== '..' ? base.slice(0, 120) : 'file';
}
