import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { publishServerEvent } from '$lib/server/events/bus.js';
import { GET } from './+server.js';

interface CallInit {
	user?: { id: string; role?: string } | null;
}

function call(init: CallInit = {}): Response {
	const url = new URL('http://localhost/api/events');
	const event = {
		locals: { user: init.user ?? null, session: null } as unknown as App.Locals,
		params: {},
		request: new Request(url, { method: 'GET' }),
		url
	};
	try {
		return GET(event as never) as Response;
	} catch (e) {
		if (isHttpError(e)) return new Response(null, { status: e.status });
		throw e;
	}
}

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
	const { value } = await reader.read();
	return new TextDecoder().decode(value);
}

describe('GET /api/events', () => {
	it('returns 401 when unauthenticated', () => {
		const res = call();
		expect(res.status).toBe(401);
	});

	it('returns an event stream and a connected comment', async () => {
		const res = call({ user: { id: 'u1' } });
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/event-stream');
		expect(res.headers.get('cache-control')).toBe('no-cache');
		const reader = res.body!.getReader();
		expect(await readChunk(reader)).toBe(': connected\n\n');
		await reader.cancel();
	});

	it('delivers published events for the stream user only', async () => {
		const res = call({ user: { id: 'u1' } });
		const reader = res.body!.getReader();
		await readChunk(reader);
		publishServerEvent('u2', { type: 'chat.stream.finished', conversationId: 'other' });
		publishServerEvent('u1', { type: 'chat.stream.finished', conversationId: 'mine' });
		const chunk = await readChunk(reader);
		expect(chunk).toBe('data: {"type":"chat.stream.finished","conversationId":"mine"}\n\n');
		await reader.cancel();
	});

	it('stops delivering after the stream is cancelled', async () => {
		const res = call({ user: { id: 'u1' } });
		const reader = res.body!.getReader();
		await readChunk(reader);
		await reader.cancel();
		publishServerEvent('u1', { type: 'chat.stream.finished', conversationId: 'c1' });
		const { done } = await Promise.race([
			reader.read(),
			new Promise<{ done: boolean }>((resolve) => setTimeout(() => resolve({ done: true }), 50))
		]);
		expect(done).toBe(true);
	});

	async function expectSilence(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
		const { done } = await Promise.race([
			reader.read(),
			new Promise<{ done: boolean }>((resolve) => setTimeout(() => resolve({ done: true }), 50))
		]);
		expect(done).toBe(true);
	}

	it('delivers proxy events from other users to admins', async () => {
		const res = call({ user: { id: 'a1', role: 'admin' } });
		const reader = res.body!.getReader();
		await readChunk(reader);
		publishServerEvent('u2', { type: 'proxy.request.started', requestId: 'r1' });
		const chunk = await readChunk(reader);
		expect(chunk).toBe('data: {"type":"proxy.request.started","requestId":"r1"}\n\n');
		await reader.cancel();
	});

	it('does not deliver proxy events from other users to non-admins', async () => {
		const res = call({ user: { id: 'u1' } });
		const reader = res.body!.getReader();
		await readChunk(reader);
		publishServerEvent('u2', { type: 'proxy.request.started', requestId: 'r1' });
		await expectSilence(reader);
		await reader.cancel();
	});

	it('does not deliver non-proxy events from other users to admins', async () => {
		const res = call({ user: { id: 'a1', role: 'admin' } });
		const reader = res.body!.getReader();
		await readChunk(reader);
		publishServerEvent('u2', { type: 'chat.stream.finished', conversationId: 'c1' });
		await expectSilence(reader);
		await reader.cancel();
	});

	it('delivers an admin their own proxy event only once', async () => {
		const res = call({ user: { id: 'a1', role: 'admin' } });
		const reader = res.body!.getReader();
		await readChunk(reader);
		publishServerEvent('a1', { type: 'proxy.request.started', requestId: 'r1' });
		const chunk = await readChunk(reader);
		expect(chunk).toBe('data: {"type":"proxy.request.started","requestId":"r1"}\n\n');
		await expectSilence(reader);
		await reader.cancel();
	});
});
