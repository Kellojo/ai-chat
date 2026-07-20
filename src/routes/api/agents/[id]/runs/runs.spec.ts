import { beforeEach, describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

process.env.DATABASE_PATH = ':memory:';

const { closeDb, getDb } = await import('$lib/server/db/index.js');
const { createAgent } = await import('$lib/server/db/repo/agents.js');
const { createAgentRun } = await import('$lib/server/db/repo/agent-runs.js');
const { GET } = await import('./+server.js');

type Db = ReturnType<typeof getDb>;

interface CallInit {
	user?: { id: string; role?: string } | null;
	params?: Record<string, string>;
}

interface RunsBody {
	runs?: { id: string; userId: string }[];
	message?: string;
}

async function call(init: CallInit = {}): Promise<{ status: number; body: RunsBody }> {
	const url = new URL('http://localhost/api/agents/x/runs');
	const event = {
		locals: { user: init.user ?? null, session: null } as unknown as App.Locals,
		params: init.params ?? {},
		url
	};
	try {
		const res = await GET(event as never);
		return { status: res.status, body: (await res.json()) as RunsBody };
	} catch (e) {
		if (isHttpError(e)) return { status: e.status, body: e.body as RunsBody };
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

function seedBuiltin() {
	return createAgent(getDb(), null, {
		name: 'builtin',
		systemPrompt: 'x',
		triggerType: 'event',
		triggerConfig: { event: 'chat.created' }
	});
}

beforeEach(() => {
	closeDb();
	seedUsers(getDb());
});

describe('GET /api/agents/[id]/runs', () => {
	it('returns 401 without auth', async () => {
		const agent = seedBuiltin();
		const res = await call({ user: null, params: { id: agent.id } });
		expect(res.status).toBe(401);
	});

	it('scopes built-in agent runs to the requesting user', async () => {
		const agent = seedBuiltin();
		createAgentRun(getDb(), { agentId: agent.id, userId: 'u1', trigger: 'event' });
		createAgentRun(getDb(), { agentId: agent.id, userId: 'u1', trigger: 'event' });
		createAgentRun(getDb(), { agentId: agent.id, userId: 'u2', trigger: 'event' });
		const res = await call({ user: u1, params: { id: agent.id } });
		expect(res.status).toBe(200);
		expect(res.body.runs).toHaveLength(2);
		expect(res.body.runs!.every((r) => r.userId === 'u1')).toBe(true);
	});

	it('returns all built-in runs to an admin', async () => {
		const agent = seedBuiltin();
		createAgentRun(getDb(), { agentId: agent.id, userId: 'u1', trigger: 'event' });
		createAgentRun(getDb(), { agentId: agent.id, userId: 'u2', trigger: 'event' });
		const res = await call({ user: admin, params: { id: agent.id } });
		expect(res.status).toBe(200);
		expect(res.body.runs).toHaveLength(2);
	});

	it("returns 404 for another user's agent", async () => {
		const agent = createAgent(getDb(), 'u1', {
			name: 'mine',
			systemPrompt: 'x',
			triggerType: 'manual'
		});
		const res = await call({ user: u2, params: { id: agent.id } });
		expect(res.status).toBe(404);
	});
});
