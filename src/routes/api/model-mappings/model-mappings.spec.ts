import { beforeEach, describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

process.env.DATABASE_PATH = ':memory:';

const { closeDb, getDb } = await import('$lib/server/db/index.js');
const { createProvider } = await import('$lib/server/db/repo/providers.js');
const { createModel } = await import('$lib/server/db/repo/models.js');
const { createModelMapping } = await import('$lib/server/db/repo/model-mappings.js');
const { GET, POST } = await import('./+server.js');
const { PATCH, DELETE: DELETE_MAPPING } = await import('./[id]/+server.js');

type Db = ReturnType<typeof getDb>;
type ModelMapping = import('$lib/types.js').ModelMapping;

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
	const url = new URL(init.url ?? 'http://localhost/api/model-mappings');
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
const admin = { id: 'admin', role: 'admin' };

let providerId: string;

function seedUsers(db: Db) {
	db.prepare(
		`INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt", role) VALUES
		 ('u1', 'a@b.c', 'A', 0, 0, 0, 'user'),
		 ('admin', 'g@h.i', 'G', 0, 0, 0, 'admin')`
	).run();
}

beforeEach(() => {
	closeDb();
	const db = getDb();
	seedUsers(db);
	providerId = createProvider(db, { name: 'P', type: 'anthropic' }).id;
	createModel(db, { providerId, modelId: 'm1' });
	createModel(db, { providerId, modelId: 'm2' });
});

describe('admin guard', () => {
	it('returns 403 for non-admin users', async () => {
		expect((await call(GET, { user: u1 })).status).toBe(403);
		expect(
			(
				await call(POST, {
					user: u1,
					body: { name: 'fast', targets: [{ providerId, modelId: 'm1' }] }
				})
			).status
		).toBe(403);
	});
});

describe('POST /api/model-mappings', () => {
	it('creates a mapping', async () => {
		const res = await call<{ mapping: ModelMapping }>(POST, {
			user: admin,
			body: {
				name: 'fast',
				targets: [
					{ providerId, modelId: 'm1' },
					{ providerId, modelId: 'm2' }
				]
			}
		});
		expect(res.status).toBe(201);
		expect(res.body.mapping.name).toBe('fast');
		expect(res.body.mapping.enabled).toBe(true);
		expect(res.body.mapping.targets).toEqual([
			{ providerId, modelId: 'm1' },
			{ providerId, modelId: 'm2' }
		]);
	});

	it('rejects a duplicate name', async () => {
		createModelMapping(getDb(), { name: 'fast', targets: [{ providerId, modelId: 'm1' }] });
		const res = await call<{ message: string }>(POST, {
			user: admin,
			body: { name: 'fast', targets: [{ providerId, modelId: 'm2' }] }
		});
		expect(res.status).toBe(400);
		expect(res.body.message).toBe('Name already in use');
	});

	it('rejects an unknown target provider', async () => {
		const res = await call<{ message: string }>(POST, {
			user: admin,
			body: { name: 'fast', targets: [{ providerId: 'nope', modelId: 'm1' }] }
		});
		expect(res.status).toBe(400);
		expect(res.body.message).toBe('Unknown target provider/model');
	});

	it('rejects an unknown target modelId', async () => {
		const res = await call<{ message: string }>(POST, {
			user: admin,
			body: { name: 'fast', targets: [{ providerId, modelId: 'nope' }] }
		});
		expect(res.status).toBe(400);
		expect(res.body.message).toBe('Unknown target provider/model');
	});
});

describe('PATCH /api/model-mappings/[id]', () => {
	it('patches name, targets, and enabled', async () => {
		const created = createModelMapping(getDb(), {
			name: 'fast',
			targets: [{ providerId, modelId: 'm1' }]
		});
		const res = await call<{ mapping: ModelMapping }>(PATCH, {
			user: admin,
			params: { id: created.id },
			body: { name: 'faster', targets: [{ providerId, modelId: 'm2' }], enabled: false }
		});
		expect(res.status).toBe(200);
		expect(res.body.mapping.name).toBe('faster');
		expect(res.body.mapping.targets).toEqual([{ providerId, modelId: 'm2' }]);
		expect(res.body.mapping.enabled).toBe(false);
	});

	it('returns 404 for an unknown id', async () => {
		const res = await call(PATCH, {
			user: admin,
			params: { id: 'missing' },
			body: { name: 'x' }
		});
		expect(res.status).toBe(404);
	});

	it('rejects renaming to another mapping’s name but allows keeping the same name', async () => {
		const a = createModelMapping(getDb(), {
			name: 'a',
			targets: [{ providerId, modelId: 'm1' }]
		});
		const b = createModelMapping(getDb(), {
			name: 'b',
			targets: [{ providerId, modelId: 'm1' }]
		});
		const dup = await call<{ message: string }>(PATCH, {
			user: admin,
			params: { id: b.id },
			body: { name: 'a' }
		});
		expect(dup.status).toBe(400);
		expect(dup.body.message).toBe('Name already in use');
		const self = await call(PATCH, { user: admin, params: { id: a.id }, body: { name: 'a' } });
		expect(self.status).toBe(200);
	});
});

describe('DELETE /api/model-mappings/[id]', () => {
	it('deletes a mapping and 404s on a second delete', async () => {
		const created = createModelMapping(getDb(), {
			name: 'fast',
			targets: [{ providerId, modelId: 'm1' }]
		});
		const res = await call(DELETE_MAPPING, { user: admin, params: { id: created.id } });
		expect(res.status).toBe(200);
		expect((await call(DELETE_MAPPING, { user: admin, params: { id: created.id } })).status).toBe(
			404
		);
	});
});

describe('GET /api/model-mappings', () => {
	it('lists all mappings', async () => {
		createModelMapping(getDb(), { name: 'a', targets: [{ providerId, modelId: 'm1' }] });
		createModelMapping(getDb(), {
			name: 'b',
			targets: [{ providerId, modelId: 'm2' }],
			enabled: false
		});
		const res = await call<{ mappings: ModelMapping[] }>(GET, { user: admin });
		expect(res.status).toBe(200);
		expect(res.body.mappings.map((m) => m.name)).toEqual(['a', 'b']);
		expect(res.body.mappings[1]?.enabled).toBe(false);
	});
});
