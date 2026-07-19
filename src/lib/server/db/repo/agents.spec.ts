import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from '../index.js';
import { createAgentRun, finishAgentRun } from './agent-runs.js';
import {
	claimAgentRun,
	createAgent,
	deleteAgent,
	getAgent,
	listAgents,
	listDueScheduleAgents,
	listPersonaAgents,
	setAgentRunTimes,
	toPublic,
	updateAgent
} from './agents.js';

let db: Db;

beforeEach(() => {
	db = openDatabase(':memory:');
	db.prepare(
		'INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt", role) VALUES (\'u1\', \'a@b.c\', \'A\', 0, 0, 0, \'user\')'
	).run();
});

describe('agents repo', () => {
	it('creates and reads an agent with JSON fields', () => {
		const row = createAgent(db, 'u1', {
			name: 'researcher',
			description: 'digs',
			systemPrompt: 'You research.',
			skillNames: ['web'],
			toolAllowlist: ['webfetch'],
			triggerType: 'schedule',
			triggerConfig: { cron: '*/5 * * * *' },
			maxSteps: 7
		});
		expect(row.id).toBeTruthy();
		const fetched = getAgent(db, row.id)!;
		const pub = toPublic(fetched);
		expect(pub.name).toBe('researcher');
		expect(pub.skillNames).toEqual(['web']);
		expect(pub.toolAllowlist).toEqual(['webfetch']);
		expect(pub.triggerConfig).toEqual({ cron: '*/5 * * * *' });
		expect(pub.maxSteps).toBe(7);
		expect(pub.enabled).toBe(true);
		expect(getAgent(db, 'missing')).toBeUndefined();
	});

	it('listAgents returns own and builtin agents', () => {
		const own = createAgent(db, 'u1', { name: 'own', systemPrompt: 'x', triggerType: 'manual' });
		const builtin = createAgent(db, null, {
			name: 'builtin',
			systemPrompt: 'x',
			triggerType: 'manual'
		});
		db.prepare(
			'INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt", role) VALUES (\'u2\', \'d@e.f\', \'D\', 0, 0, 0, \'user\')'
		).run();
		createAgent(db, 'u2', { name: 'other', systemPrompt: 'x', triggerType: 'manual' });
		expect(listAgents(db, 'u1').map((a) => a.id)).toEqual([own.id, builtin.id]);
	});

	it('listPersonaAgents filters to enabled persona agents', () => {
		const persona = createAgent(db, 'u1', {
			name: 'persona',
			systemPrompt: 'x',
			triggerType: 'persona'
		});
		createAgent(db, 'u1', { name: 'sched', systemPrompt: 'x', triggerType: 'schedule' });
		createAgent(db, 'u1', {
			name: 'off',
			systemPrompt: 'x',
			triggerType: 'persona',
			enabled: false
		});
		expect(listPersonaAgents(db, 'u1').map((a) => a.id)).toEqual([persona.id]);
	});

	it('listDueScheduleAgents returns only due, enabled, user-owned schedule agents', () => {
		const past = Date.now() - 1000;
		const due = createAgent(db, 'u1', {
			name: 'due',
			systemPrompt: 'x',
			triggerType: 'schedule',
			triggerConfig: { cron: '* * * * *' },
			nextRunAt: past
		});
		createAgent(db, 'u1', {
			name: 'future',
			systemPrompt: 'x',
			triggerType: 'schedule',
			nextRunAt: Date.now() + 60_000
		});
		createAgent(db, 'u1', {
			name: 'disabled',
			systemPrompt: 'x',
			triggerType: 'schedule',
			nextRunAt: past,
			enabled: false
		});
		createAgent(db, null, {
			name: 'builtin',
			systemPrompt: 'x',
			triggerType: 'schedule',
			nextRunAt: past
		});
		createAgent(db, 'u1', { name: 'manual', systemPrompt: 'x', triggerType: 'manual' });
		expect(listDueScheduleAgents(db, Date.now()).map((a) => a.id)).toEqual([due.id]);
	});

	it('listDueScheduleAgents excludes agents with a running run', () => {
		const past = Date.now() - 1000;
		const agent = createAgent(db, 'u1', {
			name: 'due',
			systemPrompt: 'x',
			triggerType: 'schedule',
			triggerConfig: { cron: '* * * * *' },
			nextRunAt: past
		});
		const run = createAgentRun(db, { agentId: agent.id, userId: 'u1', trigger: 'schedule' });
		expect(listDueScheduleAgents(db, Date.now()).map((a) => a.id)).toEqual([]);
		finishAgentRun(db, run.id, 'success');
		expect(listDueScheduleAgents(db, Date.now()).map((a) => a.id)).toEqual([agent.id]);
	});

	it('updateAgent patches fields and bumps updated_at', () => {
		const row = createAgent(db, 'u1', {
			name: 'a',
			systemPrompt: 'x',
			triggerType: 'manual'
		});
		const updated = updateAgent(db, row.id, {
			name: 'b',
			enabled: false,
			maxSteps: 3,
			toolAllowlist: null
		})!;
		expect(updated.name).toBe('b');
		expect(updated.enabled).toBe(0);
		expect(updated.max_steps).toBe(3);
		expect(updated.tool_allowlist).toBeNull();
		expect(updated.updated_at).toBeGreaterThanOrEqual(row.updated_at);
		expect(updateAgent(db, 'missing', { name: 'x' })).toBeUndefined();
	});

	it('setAgentRunTimes sets only the given fields', () => {
		const row = createAgent(db, 'u1', {
			name: 'a',
			systemPrompt: 'x',
			triggerType: 'schedule',
			nextRunAt: 111
		});
		setAgentRunTimes(db, row.id, { lastRunAt: 222 });
		let fetched = getAgent(db, row.id)!;
		expect(fetched.last_run_at).toBe(222);
		expect(fetched.next_run_at).toBe(111);
		setAgentRunTimes(db, row.id, { nextRunAt: 333 });
		fetched = getAgent(db, row.id)!;
		expect(fetched.last_run_at).toBe(222);
		expect(fetched.next_run_at).toBe(333);
	});

	it('claimAgentRun succeeds once for a stale expected value', () => {
		const row = createAgent(db, 'u1', {
			name: 'a',
			systemPrompt: 'x',
			triggerType: 'schedule',
			nextRunAt: 111
		});
		expect(claimAgentRun(db, row.id, 111, 222)).toBe(true);
		expect(getAgent(db, row.id)!.next_run_at).toBe(222);
		expect(claimAgentRun(db, row.id, 111, 333)).toBe(false);
		expect(claimAgentRun(db, row.id, 222, null)).toBe(true);
		expect(getAgent(db, row.id)!.next_run_at).toBeNull();
		expect(claimAgentRun(db, row.id, 222, 333)).toBe(false);
		expect(claimAgentRun(db, row.id, null, 333)).toBe(true);
	});

	it('deleteAgent removes the row', () => {
		const row = createAgent(db, 'u1', { name: 'a', systemPrompt: 'x', triggerType: 'manual' });
		expect(deleteAgent(db, row.id)).toBe(true);
		expect(deleteAgent(db, row.id)).toBe(false);
	});
});
