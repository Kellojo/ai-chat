import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Db } from '../db/index.js';
import { createAgent, setAgentOverride } from '../db/repo/agents.js';
import { createAgentRun, finishAgentRun } from '../db/repo/agent-runs.js';
import { emitAgentEvent } from './events.js';

let db: Db;

beforeEach(() => {
	db = openDatabase(':memory:');
	db.prepare(
		`INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt", role) VALUES
		 ('u1', 'a@b.c', 'A', 0, 0, 0, 'user'),
		 ('u2', 'd@e.f', 'D', 0, 0, 0, 'user')`
	).run();
});

function seedEventAgent(
	userId: string | null,
	triggerConfig: {
		event: 'memory.changed' | 'chat.created' | 'chat.message_completed';
		every?: number;
		instructions?: string;
	}
) {
	return createAgent(db, userId, {
		name: 'ev',
		systemPrompt: 'x',
		triggerType: 'event',
		triggerConfig
	});
}

describe('emitAgentEvent', () => {
	it('runs on each occurrence when every is 1 or absent', async () => {
		const agent = seedEventAgent('u1', { event: 'memory.changed' });
		const runFn = vi.fn().mockResolvedValue(undefined);
		await emitAgentEvent('memory.changed', 'u1', { path: 'a.md' }, db, runFn);
		await emitAgentEvent('memory.changed', 'u1', { path: 'b.md' }, db, runFn);
		expect(runFn).toHaveBeenCalledTimes(2);
		expect(runFn).toHaveBeenNthCalledWith(1, agent.id, 'u1', expect.any(String));
	});

	it('runs only on every Nth occurrence', async () => {
		seedEventAgent('u1', { event: 'memory.changed', every: 3 });
		const runFn = vi.fn().mockResolvedValue(undefined);
		for (let i = 0; i < 6; i++) {
			await emitAgentEvent('memory.changed', 'u1', { i }, db, runFn);
		}
		expect(runFn).toHaveBeenCalledTimes(2);
		expect(runFn.mock.calls[0][2]).toContain('occurrence #3');
		expect(runFn.mock.calls[1][2]).toContain('occurrence #6');
	});

	it('keeps per-user counters independent', async () => {
		const agent = seedEventAgent(null, { event: 'chat.created', every: 2 });
		const runFn = vi.fn().mockResolvedValue(undefined);
		await emitAgentEvent('chat.created', 'u1', {}, db, runFn);
		await emitAgentEvent('chat.created', 'u2', {}, db, runFn);
		expect(runFn).not.toHaveBeenCalled();
		await emitAgentEvent('chat.created', 'u1', {}, db, runFn);
		expect(runFn).toHaveBeenCalledTimes(1);
		expect(runFn).toHaveBeenLastCalledWith(agent.id, 'u1', expect.any(String));
		await emitAgentEvent('chat.created', 'u2', {}, db, runFn);
		expect(runFn).toHaveBeenCalledTimes(2);
		expect(runFn).toHaveBeenLastCalledWith(agent.id, 'u2', expect.any(String));
	});

	it('skips a built-in agent for users whose override disables it', async () => {
		const agent = seedEventAgent(null, { event: 'memory.changed' });
		setAgentOverride(db, 'u2', agent.id, false);
		const runFn = vi.fn().mockResolvedValue(undefined);
		await emitAgentEvent('memory.changed', 'u2', {}, db, runFn);
		expect(runFn).not.toHaveBeenCalled();
		await emitAgentEvent('memory.changed', 'u1', {}, db, runFn);
		expect(runFn).toHaveBeenCalledTimes(1);
		expect(runFn).toHaveBeenCalledWith(agent.id, 'u1', expect.any(String));
	});

	it('runs a row-disabled built-in for users with an enabling override', async () => {
		const agent = seedEventAgent(null, { event: 'memory.changed' });
		db.prepare('UPDATE agents SET enabled = 0 WHERE id = ?').run(agent.id);
		setAgentOverride(db, 'u1', agent.id, true);
		const runFn = vi.fn().mockResolvedValue(undefined);
		await emitAgentEvent('memory.changed', 'u1', {}, db, runFn);
		expect(runFn).toHaveBeenCalledTimes(1);
		expect(runFn).toHaveBeenCalledWith(agent.id, 'u1', expect.any(String));
	});

	it('skips a row-disabled built-in without an enabling override', async () => {
		const agent = seedEventAgent(null, { event: 'memory.changed' });
		db.prepare('UPDATE agents SET enabled = 0 WHERE id = ?').run(agent.id);
		const runFn = vi.fn().mockResolvedValue(undefined);
		await emitAgentEvent('memory.changed', 'u1', {}, db, runFn);
		expect(runFn).not.toHaveBeenCalled();
	});

	it("does not trigger a user-owned agent for another user's event", async () => {
		seedEventAgent('u2', { event: 'memory.changed' });
		const runFn = vi.fn().mockResolvedValue(undefined);
		await emitAgentEvent('memory.changed', 'u1', {}, db, runFn);
		expect(runFn).not.toHaveBeenCalled();
	});

	it('skips an agent that already has a running run', async () => {
		const agent = seedEventAgent('u1', { event: 'memory.changed' });
		const run = createAgentRun(db, { agentId: agent.id, userId: 'u1', trigger: 'manual' });
		const runFn = vi.fn().mockResolvedValue(undefined);
		await emitAgentEvent('memory.changed', 'u1', {}, db, runFn);
		expect(runFn).not.toHaveBeenCalled();
		finishAgentRun(db, run.id, 'success');
		await emitAgentEvent('memory.changed', 'u1', {}, db, runFn);
		expect(runFn).toHaveBeenCalledTimes(1);
		expect(runFn.mock.calls[0][2]).toContain('occurrence #1');
	});

	it('includes event name, occurrence number and payload in the instructions', async () => {
		seedEventAgent('u1', { event: 'chat.message_completed' });
		const runFn = vi.fn().mockResolvedValue(undefined);
		await emitAgentEvent('chat.message_completed', 'u1', { conversationId: 'c1' }, db, runFn);
		expect(runFn).toHaveBeenCalledTimes(1);
		const instructions = runFn.mock.calls[0][2] as string;
		expect(instructions).toBe(
			'The event "chat.message_completed" just occurred (occurrence #1). Payload: {"conversationId":"c1"}. Act on it according to your role.'
		);
	});

	it('prefixes triggerConfig.instructions when set', async () => {
		seedEventAgent('u1', { event: 'memory.changed', instructions: 'Clean up old memories.' });
		const runFn = vi.fn().mockResolvedValue(undefined);
		await emitAgentEvent('memory.changed', 'u1', { path: 'x.md' }, db, runFn);
		expect(runFn).toHaveBeenCalledTimes(1);
		expect(runFn.mock.calls[0][2]).toBe(
			'Clean up old memories.\n\nTriggering event: "memory.changed" (occurrence #1). Payload: {"path":"x.md"}'
		);
	});

	it('ignores agents subscribed to a different event', async () => {
		seedEventAgent('u1', { event: 'chat.created' });
		const runFn = vi.fn().mockResolvedValue(undefined);
		await emitAgentEvent('memory.changed', 'u1', {}, db, runFn);
		expect(runFn).not.toHaveBeenCalled();
	});

	it('never throws when the database lookup fails', async () => {
		const closed = openDatabase(':memory:');
		closed.close();
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		await expect(
			emitAgentEvent('memory.changed', 'u1', {}, closed, vi.fn())
		).resolves.toBeUndefined();
		expect(consoleError).toHaveBeenCalled();
		consoleError.mockRestore();
	});
});
