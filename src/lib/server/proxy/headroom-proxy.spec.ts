import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { stopHeadroomProxy, isHeadroomProxyRunning, getHeadroomProxyUrl } from './headroom-proxy.js';

// Mock child_process.spawn
vi.mock('node:child_process', () => ({
	spawn: vi.fn(() => ({
		stdout: { on: vi.fn() },
		stderr: { on: vi.fn() },
		on: vi.fn(),
		kill: vi.fn()
	}))
}));

describe('headroom proxy lifecycle', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		stopHeadroomProxy();
	});

	it('stops the proxy and resets state', () => {
		stopHeadroomProxy();
		expect(isHeadroomProxyRunning()).toBe(false);
	});

	it('returns the correct proxy URL', () => {
		expect(getHeadroomProxyUrl()).toBe('http://localhost:8787');
	});
});
