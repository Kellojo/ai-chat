import { beforeEach, describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

process.env.DATABASE_PATH = ':memory:';

const { closeDb, getDb } = await import('$lib/server/db/index.js');
const { createAgent } = await import('$lib/server/db/repo/agents.js');
const { GET, POST } = await import('./+server.js');
const { GET: GET_ONE, PATCH, DELETE: DELETE_AGENT } = await import('./[id]/+server.js');
const { GET: GET_RUNS } = await import('./[id]/runs/+server.js');

type Db = ReturnType<typeof getDb>;

interface CallInit {
	user?: { id: string; role?: string } | null;
	params?: Record<string, string>;
	body?: unknown;
	url?: string;
	headers?: Record<string, string>;
	method?: string;
}

async function call<T = unknown>(
	handler: (event: never) => Response | Promise<Response>,
	init: CallInit = {}
): Promise<{ status: number; body: T }> {
	const url = new URL(init.url ?? 'http://localhost/api/agents');
	const headers = new Headers(init.headers);
	let body: string | undefined;
	if (init.body !== undefined) {
		headers.set('content-type', 'application/json');
		body = JSON.stringify(init.body);
	}
	const event = {
		locals: { user: init.user ?? null, session: null } as unknown as App.Locals,
		params: init.params ?? {},
		request: new Request(url, {
			method: init.method ?? (body !== undefined ? 'POST' : 'GET'),
			headers,
			body
		}),
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
const admin = { id: 'admin', role: 'admin' };

function seedUsers(db: Db) {
	db.prepare(
		`INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt", role) VALUES
		 ('u1', 'a@b.c', 'A', 0, 0, 0, 'user'),
		 ('u2', 'd@e.f', 'D', 0, 0, 0, 'user'),
		 ('admin', 'g@h.i', 'G', 0, 0, 0, 'admin')`
	).run();
}

beforeEach(() => {
	closeDb();
	seedUsers(getDb());
});

describe('POST /api/agents validation', () => {
	it('rejects a schedule trigger without cron', async () => {
		const res = await call(POST, {
			user: u1,
			body: { name: 'a', systemPrompt: 'x', triggerType: 'schedule' }
		});
		expect(res.status).toBe(400);
	});

	it('rejects an invalid cron expression', async () => {
		const res = await call(POST, {
			user: u1,
			body: {
				name: 'a',
				systemPrompt: 'x',
				triggerType: 'schedule',
				triggerConfig: { cron: 'not a cron' }
			}
		});
		expect(res.status).toBe(400);
	});

	it('creates a valid schedule agent with nextRunAt set', async () => {
		const res = await call<{ agent: import('$lib/types.js').Agent }>(POST, {
			user: u1,
			body: {
				name: 'a',
				systemPrompt: 'x',
				triggerType: 'schedule',
				triggerConfig: { cron: '*/5 * * * *' }
			}
		});
		expect(res.status).toBe(201);
		expect(res.body.agent.nextRunAt).toBeGreaterThan(Date.now());
	});

	it('creates a persona agent without cron', async () => {
		const res = await call<{ agent: import('$lib/types.js').Agent }>(POST, {
			user: u1,
			body: { name: 'a', systemPrompt: 'x', triggerType: 'persona' }
		});
		expect(res.status).toBe(201);
		expect(res.body.agent.nextRunAt).toBeNull();
	});
});

describe('agent ownership scoping', () => {
	it("returns 404 for GET/PATCH/DELETE of another user's agent", async () => {
		const agent = createAgent(getDb(), 'u1', {
			name: 'mine',
			systemPrompt: 'x',
			triggerType: 'manual'
		});
		expect((await call(GET_ONE, { user: u2, params: { id: agent.id } })).status).toBe(404);
		expect(
			(await call(PATCH, { user: u2, params: { id: agent.id }, body: { name: 'hacked' } })).status
		).toBe(404);
		expect((await call(DELETE_AGENT, { user: u2, params: { id: agent.id } })).status).toBe(404);
		expect((await call(GET_RUNS, { user: u2, params: { id: agent.id } })).status).toBe(404);
	});

	it('lists builtin agents but forbids modifying them', async () => {
		const builtin = createAgent(getDb(), null, {
			name: 'builtin',
			systemPrompt: 'x',
			triggerType: 'manual'
		});
		const list = await call<{ agents: import('$lib/types.js').Agent[] }>(GET, { user: u2 });
		expect(list.body.agents.map((a) => a.id)).toContain(builtin.id);
		expect((await call(GET_ONE, { user: u2, params: { id: builtin.id } })).status).toBe(200);
		expect(
			(await call(PATCH, { user: u2, params: { id: builtin.id }, body: { name: 'nope' } })).status
		).toBe(403);
		expect((await call(DELETE_AGENT, { user: u2, params: { id: builtin.id } })).status).toBe(403);
	});

	it('lets an admin list runs of a builtin agent', async () => {
		const builtin = createAgent(getDb(), null, {
			name: 'builtin',
			systemPrompt: 'x',
			triggerType: 'manual'
		});
		expect((await call(GET_RUNS, { user: u2, params: { id: builtin.id } })).status).toBe(403);
		const res = await call<{ runs: unknown[] }>(GET_RUNS, {
			user: admin,
			params: { id: builtin.id }
		});
		expect(res.status).toBe(200);
		expect(res.body.runs).toEqual([]);
	});
});

describe('PATCH /api/agents/[id]', () => {
	it('recomputes nextRunAt when enabled changes', async () => {
		const agent = createAgent(getDb(), 'u1', {
			name: 'a',
			systemPrompt: 'x',
			triggerType: 'schedule',
			triggerConfig: { cron: '*/5 * * * *' },
			enabled: false
		});
		const res = await call<{ agent: import('$lib/types.js').Agent }>(PATCH, {
			user: u1,
			params: { id: agent.id },
			body: { enabled: true }
		});
		expect(res.status).toBe(200);
		expect(res.body.agent.nextRunAt).toBeGreaterThan(Date.now());
		const off = await call<{ agent: import('$lib/types.js').Agent }>(PATCH, {
			user: u1,
			params: { id: agent.id },
			body: { enabled: false }
		});
		expect(off.body.agent.nextRunAt).toBeNull();
	});

	it('rejects an invalid cron on patch', async () => {
		const agent = createAgent(getDb(), 'u1', {
			name: 'a',
			systemPrompt: 'x',
			triggerType: 'manual'
		});
		const res = await call(PATCH, {
			user: u1,
			params: { id: agent.id },
			body: { triggerType: 'schedule', triggerConfig: { cron: 'nope' } }
		});
		expect(res.status).toBe(400);
	});

	it('deletes an owned agent', async () => {
		const agent = createAgent(getDb(), 'u1', {
			name: 'a',
			systemPrompt: 'x',
			triggerType: 'manual'
		});
		const res = await call(DELETE_AGENT, { user: u1, params: { id: agent.id } });
		expect(res.status).toBe(200);
		expect((await call(GET_ONE, { user: u1, params: { id: agent.id } })).status).toBe(404);
	});
});
