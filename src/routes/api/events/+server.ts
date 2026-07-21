import { requireUser } from '$lib/server/auth/guards.js';
import { subscribeAllServerEvents, subscribeServerEvents } from '$lib/server/events/bus.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, request }) => {
	const user = requireUser(locals);
	const isAdmin = (user as { role?: string }).role === 'admin';
	const encoder = new TextEncoder();
	let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
	let unsubscribe: (() => void) | null = null;
	let unsubscribeAll: (() => void) | null = null;
	let heartbeat: ReturnType<typeof setInterval> | null = null;

	const cleanup = () => {
		if (heartbeat) clearInterval(heartbeat);
		heartbeat = null;
		unsubscribe?.();
		unsubscribe = null;
		unsubscribeAll?.();
		unsubscribeAll = null;
		try {
			controller?.close();
		} catch {
			// stream already closed
		}
	};

	const send = (chunk: string) => {
		if (!controller) return;
		try {
			controller.enqueue(encoder.encode(chunk));
		} catch {
			cleanup();
		}
	};

	const stream = new ReadableStream<Uint8Array>({
		start(c) {
			controller = c;
			unsubscribe = subscribeServerEvents(user.id, (_userId, event) => {
				send(`data: ${JSON.stringify(event)}\n\n`);
			});
			if (isAdmin) {
				unsubscribeAll = subscribeAllServerEvents((userId, event) => {
					if (userId === user.id) return;
					if (!event.type.startsWith('proxy.')) return;
					send(`data: ${JSON.stringify(event)}\n\n`);
				});
			}
			heartbeat = setInterval(() => send(': ping\n\n'), 25_000);
			request.signal.addEventListener('abort', cleanup);
			send(': connected\n\n');
		},
		cancel() {
			cleanup();
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			'x-accel-buffering': 'no'
		}
	});
};
