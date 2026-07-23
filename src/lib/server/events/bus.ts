import type { ServerEvent } from '$lib/types.js';
import { createLogger } from '../logger.js';

const log = createLogger('events');

export type ServerEventListener = (userId: string, event: ServerEvent) => void;

interface BusState {
	perUser: Map<string, Set<ServerEventListener>>;
	all: Set<ServerEventListener>;
}

const globalState = globalThis as { __serverEventBus?: BusState };

function busState(): BusState {
	if (!globalState.__serverEventBus) {
		globalState.__serverEventBus = { perUser: new Map(), all: new Set() };
	}
	return globalState.__serverEventBus;
}

export function publishServerEvent(userId: string, event: ServerEvent): void {
	const bus = busState();
	const listeners = [...(bus.perUser.get(userId) ?? []), ...bus.all];
	for (const listener of listeners) {
		try {
			listener(userId, event);
		} catch (e) {
			log.error('Server event listener failed', {
				error: e instanceof Error ? e.message : String(e)
			});
		}
	}
}

export function subscribeServerEvents(userId: string, listener: ServerEventListener): () => void {
	const bus = busState();
	let set = bus.perUser.get(userId);
	if (!set) {
		set = new Set();
		bus.perUser.set(userId, set);
	}
	set.add(listener);
	return () => {
		set.delete(listener);
		if (set.size === 0) bus.perUser.delete(userId);
	};
}

export function subscribeAllServerEvents(listener: ServerEventListener): () => void {
	const bus = busState();
	bus.all.add(listener);
	return () => {
		bus.all.delete(listener);
	};
}
