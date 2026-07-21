import { beforeEach, describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

process.env.DATABASE_PATH = ':memory:';

const { closeDb, getDb } = await import('$lib/server/db/index.js');
const { POST } = await import('./+server.js');
const { getUserSetting } = await import('$lib/server/db/repo/user-settings.js');

type Db = ReturnType<typeof getDb>;

interface CallInit {
	user?: { id: string; role?: string } | null;
	body?: unknown;
}

async function call<T = unknown>(
	handler: (event: never) => Response | Promise<Response>,
	init: CallInit = {}
): Promise<{ status: number; body: T }> {
	const url = new URL('http://localhost/api/proxy-settings');
	let body: string | undefined;
	if (init.body !== undefined) body = JSON.stringify(init.body);
	const event = {
		locals: { user: init.user ?? null, session: null } as unknown as App.Locals,
		request: new Request(url, {
			method: 'POST',
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

function seedUsers(db: Db) {
	db.prepare(
		`INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt", role) VALUES
		 ('u1', 'a@b.c', 'A', 0, 0, 0, 'user')`
	).run();
}

beforeEach(() => {
	closeDb();
	seedUsers(getDb());
});

interface SettingsBody {
	settings: { caveman: string; headroom: boolean };
}

describe('proxy-settings endpoint', () => {
	it('requires authentication', async () => {
		const res = await call(POST, { body: { caveman: 'lite' } });
		expect(res.status).toBe(401);
	});

	it('rejects invalid bodies', async () => {
		expect((await call(POST, { user: u1, body: { caveman: 'maximum' } })).status).toBe(400);
		expect((await call(POST, { user: u1, body: { headroom: 'yes' } })).status).toBe(400);
		expect((await call(POST, { user: u1, body: {} })).status).toBe(400);
		expect((await call(POST, { user: u1, body: null })).status).toBe(400);
	});

	it('saves caveman and headroom settings and returns them', async () => {
		const res = await call<SettingsBody>(POST, {
			user: u1,
			body: { caveman: 'full', headroom: true }
		});
		expect(res.status).toBe(200);
		expect(res.body.settings).toEqual({ caveman: 'full', headroom: true });
		expect(getUserSetting(getDb(), 'u1', 'proxyCaveman')).toBe('full');
		expect(getUserSetting(getDb(), 'u1', 'proxyHeadroom')).toBe(true);
	});

	it('updates one key without clobbering the other', async () => {
		await call(POST, { user: u1, body: { caveman: 'wenyan', headroom: true } });
		const res = await call<SettingsBody>(POST, { user: u1, body: { caveman: 'off' } });
		expect(res.body.settings).toEqual({ caveman: 'off', headroom: true });
	});

	it('falls back to defaults for unset or invalid values', async () => {
		const res = await call<SettingsBody>(POST, { user: u1, body: { headroom: true } });
		expect(res.body.settings.caveman).toBe('off');
	});
});
