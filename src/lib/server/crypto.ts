import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

let cachedKey: Buffer | null = null;

export function getAppSecret(): string {
	if (config.APP_SECRET) return config.APP_SECRET;
	const secretPath = path.join(path.dirname(config.DATABASE_PATH), '.secret');
	if (fs.existsSync(secretPath)) {
		return fs.readFileSync(secretPath, 'utf8').trim();
	}
	const generated = randomBytes(32).toString('hex');
	fs.mkdirSync(path.dirname(secretPath), { recursive: true });
	fs.writeFileSync(secretPath, generated, { mode: 0o600 });
	return generated;
}

function getKey(): Buffer {
	if (!cachedKey) {
		cachedKey = Buffer.from(hkdfSync('sha256', getAppSecret(), 'ai-chat', 'secret-encryption', 32));
	}
	return cachedKey;
}

export function encryptSecret(plain: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
	const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString('base64')).join('.');
}

export function decryptSecret(blob: string): string {
	const parts = blob.split('.');
	if (parts.length !== 3) throw new Error('Malformed encrypted secret');
	const [iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, 'base64'));
	const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
