import { describe, expect, it, beforeEach, vi } from 'vitest';

beforeEach(() => {
	vi.resetModules();
	process.env.APP_SECRET = 'test-secret-key-material-0123456789';
	process.env.DATABASE_PATH = ':memory:';
});

describe('crypto', () => {
	it('round-trips a secret', async () => {
		const { encryptSecret, decryptSecret } = await import('./crypto.js');
		const blob = encryptSecret('sk-ant-abc123');
		expect(blob).not.toContain('sk-ant-abc123');
		expect(decryptSecret(blob)).toBe('sk-ant-abc123');
	});

	it('produces unique ciphertexts for identical plaintext', async () => {
		const { encryptSecret } = await import('./crypto.js');
		expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
	});

	it('rejects malformed blobs', async () => {
		const { decryptSecret } = await import('./crypto.js');
		expect(() => decryptSecret('not-a-blob')).toThrow();
	});

	it('fails to decrypt with a different key', async () => {
		const { encryptSecret } = await import('./crypto.js');
		const blob = encryptSecret('secret');
		vi.resetModules();
		process.env.APP_SECRET = 'different-secret-key-material-xyz';
		const { decryptSecret } = await import('./crypto.js');
		expect(() => decryptSecret(blob)).toThrow();
	});
});
