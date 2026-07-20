import { beforeEach, describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

process.env.DATABASE_PATH = ':memory:';
process.env.APP_SECRET = 'test-secret-test-secret';

const { closeDb, getDb } = await import('$lib/server/db/index.js');
const { createAgentRun, finishAgentRun } = await import('$lib/server/db/repo/agent-runs.js');
const { createAgent } = await import('$lib/server/db/repo/agents.js');
const { GET } = await import('./+server.js');

type Db = ReturnType<typeof getDb>;

interface CallInit {
	user?: { id: string; role?: string } | null;
}

async function call<T = unknown>(
	handler: (event: never) => Response | Promise<Response>,
	init: CallInit = {}
): Promise<{ status: number; body: T }> {
	const url = new URL('http://localhost/api/agents/stats');
	const event = {
		locals: { user: init.user ?? null, session: null } as unknown as App.Locals,
		params: {},
		request: new Request(url, { method: 'GET' }),
		url
	};
	try {
		const res = await handler(event as never);
		return { status: res.status, body: (await res.json()) as T };
	} catch (e) {
		if (isHttpError(e)) return { status: e.status, body: e.body as T };
		throw e;
	}
}

const u1 = { id: 'u1', role: 'user' };
const u2 = { id: 'u2', role: 'user' };

function seedUsers(db: Db) {
	db.prepare(
		`INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt", role) VALUES
		 ('u1', 'a@b.c', 'A', 0, 0, 0, 'user'),
		 ('u2', 'd@e.f', 'D', 0, 0, 0, 'user')`
	).run();
}

function seedAgent(userId: string | null, name: string) {
	return createAgent(getDb(), userId, { name, systemPrompt: 'x', triggerType: 'manual' });
}

beforeEach(() => {
	closeDb();
	seedUsers(getDb());
});

describe('GET /api/agents/stats', () => {
	it('returns 401 without auth', async () => {
		const res = await call(GET, { user: null });
		expect(res.status).toBe(401);
	});

	it('returns running and total counts', async () => {
		const a = seedAgent('u1', 'a');
		const b = seedAgent('u1', 'b');
		seedAgent('u1', 'c');
		createAgentRun(getDb(), { agentId: a.id, userId: 'u1', trigger: 'manual' });
		const done = createAgentRun(getDb(), { agentId: b.id, userId: 'u1', trigger: 'manual' });
		finishAgentRun(getDb(), done.id, 'success');
		const res = await call<{ running: number; total: number }>(GET, { user: u1 });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ running: 1, total: 3 });
	});

	it('returns zeros when the user has no agents', async () => {
		const res = await call<{ running: number; total: number }>(GET, { user: u1 });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ running: 0, total: 0 });
	});

	it("does not count other users' agents or runs", async () => {
		const mine = seedAgent('u1', 'mine');
		const theirs = seedAgent('u2', 'theirs');
		createAgentRun(getDb(), { agentId: mine.id, userId: 'u1', trigger: 'manual' });
		createAgentRun(getDb(), { agentId: theirs.id, userId: 'u2', trigger: 'manual' });
		const res = await call<{ running: number; total: number }>(GET, { user: u1 });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ running: 1, total: 1 });
	});

	it('excludes disabled agents that are not running', async () => {
		seedAgent('u1', 'on');
		createAgent(getDb(), 'u1', {
			name: 'off',
			systemPrompt: 'x',
			triggerType: 'manual',
			enabled: false
		});
		const res = await call<{ running: number; total: number }>(GET, { user: u1 });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ running: 0, total: 1 });
	});

	it('counts disabled agents with a running run in running and total', async () => {
		const enabled = seedAgent('u1', 'on');
		const disabled = createAgent(getDb(), 'u1', {
			name: 'off',
			systemPrompt: 'x',
			triggerType: 'manual',
			enabled: false
		});
		createAgentRun(getDb(), { agentId: enabled.id, userId: 'u1', trigger: 'manual' });
		createAgentRun(getDb(), { agentId: disabled.id, userId: 'u1', trigger: 'manual' });
		const res = await call<{ running: number; total: number }>(GET, { user: u1 });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ running: 2, total: 2 });
	});

	it('counts builtin agents in total and their running runs', async () => {
		const builtin = seedAgent(null, 'builtin');
		createAgentRun(getDb(), { agentId: builtin.id, userId: 'u2', trigger: 'manual' });
		const res = await call<{ running: number; total: number }>(GET, { user: u2 });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ running: 1, total: 1 });
	});
});
