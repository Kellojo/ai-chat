import { describe, expect, it, vi } from 'vitest';
import type { ServerEvent } from '$lib/types.js';
import { publishServerEvent, subscribeAllServerEvents, subscribeServerEvents } from './bus.js';

const event: ServerEvent = { type: 'chat.stream.finished', conversationId: 'c1' };

describe('server event bus', () => {
	it('delivers events to subscribers of the same user only', () => {
		const mine = vi.fn();
		const theirs = vi.fn();
		const offMine = subscribeServerEvents('u1', mine);
		const offTheirs = subscribeServerEvents('u2', theirs);
		publishServerEvent('u1', event);
		expect(mine).toHaveBeenCalledTimes(1);
		expect(mine).toHaveBeenCalledWith('u1', event);
		expect(theirs).not.toHaveBeenCalled();
		offMine();
		offTheirs();
	});

	it('delivers events with their userId to wildcard subscribers', () => {
		const all = vi.fn();
		const off = subscribeAllServerEvents(all);
		publishServerEvent('u2', event);
		expect(all).toHaveBeenCalledTimes(1);
		expect(all).toHaveBeenCalledWith('u2', event);
		off();
	});

	it('stops delivering after unsubscribe', () => {
		const listener = vi.fn();
		const off = subscribeServerEvents('u1', listener);
		off();
		publishServerEvent('u1', event);
		expect(listener).not.toHaveBeenCalled();
	});

	it('keeps notifying remaining listeners when one throws', () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const listener = vi.fn();
		const offBad = subscribeServerEvents('u1', () => {
			throw new Error('boom');
		});
		const offGood = subscribeServerEvents('u1', listener);
		publishServerEvent('u1', event);
		expect(listener).toHaveBeenCalledTimes(1);
		expect(consoleError).toHaveBeenCalled();
		offBad();
		offGood();
		consoleError.mockRestore();
	});
});
