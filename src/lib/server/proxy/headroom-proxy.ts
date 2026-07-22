import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const PROXY_PORT = 8787;
const HEALTH_URL = `http://localhost:${PROXY_PORT}/health`;
const STARTUP_TIMEOUT_MS = 30_000;
const HEALTH_CHECK_INTERVAL_MS = 500;

let proxyProcess: ChildProcess | null = null;
let proxyReady = false;
let startupPromise: Promise<boolean> | null = null;

async function checkHealth(): Promise<boolean> {
	try {
		const response = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(2000) });
		return response.ok;
	} catch {
		return false;
	}
}

export async function startHeadroomProxy(): Promise<boolean> {
	if (proxyReady) return true;
	if (startupPromise) return startupPromise;

	startupPromise = (async () => {
		try {
			// Check if proxy is already running
			if (await checkHealth()) {
				proxyReady = true;
				return true;
			}

			// Spawn headroom proxy
			proxyProcess = spawn('headroom', ['proxy', '--port', String(PROXY_PORT)], {
				stdio: ['ignore', 'pipe', 'pipe'],
				detached: false
			});

			proxyProcess.stdout?.on('data', (data) => {
				console.log('[headroom-proxy]', data.toString().trim());
			});

			proxyProcess.stderr?.on('data', (data) => {
				console.error('[headroom-proxy]', data.toString().trim());
			});

			proxyProcess.on('error', (err) => {
				console.error('[headroom-proxy] Failed to start:', err.message);
				proxyProcess = null;
				proxyReady = false;
			});

			proxyProcess.on('exit', (code) => {
				console.log('[headroom-proxy] Exited with code:', code);
				proxyProcess = null;
				proxyReady = false;
			});

			// Wait for proxy to become healthy
			const startTime = Date.now();
			while (Date.now() - startTime < STARTUP_TIMEOUT_MS) {
				if (await checkHealth()) {
					proxyReady = true;
					console.log('[headroom-proxy] Started successfully on port', PROXY_PORT);
					return true;
				}
				await delay(HEALTH_CHECK_INTERVAL_MS);
			}

			console.error('[headroom-proxy] Startup timeout');
			stopHeadroomProxy();
			return false;
		} catch (err) {
			console.error('[headroom-proxy] Startup error:', err);
			return false;
		}
	})();

	return startupPromise;
}

export function stopHeadroomProxy(): void {
	if (proxyProcess) {
		proxyProcess.kill('SIGTERM');
		proxyProcess = null;
	}
	proxyReady = false;
	startupPromise = null;
}

export function isHeadroomProxyRunning(): boolean {
	return proxyReady;
}

export function getHeadroomProxyUrl(): string {
	return `http://localhost:${PROXY_PORT}`;
}

// Graceful shutdown
process.on('SIGTERM', stopHeadroomProxy);
process.on('SIGINT', stopHeadroomProxy);
