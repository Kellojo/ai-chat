import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

process.env.DATABASE_PATH = ':memory:';
process.env.APP_SECRET = 'test-secret-test-secret';

let capturedOptions: unknown;

vi.mock('$lib/server/llm/registry.js', async () => {
	const { MockLanguageModelV3 } = await import('ai/test');
	const simulateReadableStream = (await import('ai')).simulateReadableStream;
	class ModelUnavailableError extends Error {}
	const model = new MockLanguageModelV3({
		doStream: async (options) => {
			capturedOptions = options;
			return {
				stream: simulateReadableStream({
					chunks: [
						{ type: 'text-start', id: 't1' },
						{ type: 'text-delta', id: 't1', delta: 'Hi ' },
						{ type: 'text-delta', id: 't1', delta: 'there' },
						{ type: 'text-end', id: 't1' },
						{
							type: 'finish',
							finishReason: 'stop',
							usage: {
								inputTokens: {
									total: 1,
									noCache: undefined,
									cacheRead: undefined,
									cacheWrite: undefined
								},
								outputTokens: { total: 2, text: undefined, reasoning: undefined }
							}
						} as never
					]
				})
			};
		}
	});
	return {
		resolveModel: () => model,
		ModelUnavailableError
	};
});

const { getDb, closeDb } = await import('../db/index.js');
const { createApiKey } = await import('../db/repo/api-keys.js');
const { createProvider } = await import('../db/repo/providers.js');
const { createModel } = await import('../db/repo/models.js');
const { listProxyRequests } = await import('../db/repo/proxy-requests.js');
const { getUserSetting, setUserSetting } = await import('../db/repo/user-settings.js');
const { cavemanOverheadTokens, CAVEMAN_PROMPTS } = await import('./caveman.js');
const { POST: POST_CHAT } = await import('../../../routes/api/v1/chat/completions/+server.js');
const { POST: POST_RESPONSES } = await import('../../../routes/api/v1/responses/+server.js');

interface CallInit {
	body?: unknown;
	headers?: Record<string, string>;
	method?: string;
	url?: string;
}

async function callResponse(
	handler: (event: never) => Response | Promise<Response>,
	init: CallInit = {}
): Promise<Response> {
	const url = new URL(init.url ?? 'http://localhost/api/v1/chat/completions');
	const headers = new Headers(init.headers);
	let body: string | undefined;
	if (init.body !== undefined) {
		headers.set('content-type', 'application/json');
		body = JSON.stringify(init.body);
	}
	const event = {
		locals: { user: null, session: null } as unknown as App.Locals,
		params: {},
		request: new Request(url, {
			method: init.method ?? (body !== undefined ? 'POST' : 'GET'),
			headers,
			body
		}),
		url
	};
	try {
		return await handler(event as never);
	} catch (e) {
		if (isHttpError(e)) {
			return new Response(JSON.stringify(e.body), {
				status: e.status,
				headers: { 'content-type': 'application/json' }
			});
		}
		throw e;
	}
}

let rawKey: string;

function auth(): Record<string, string> {
	return { authorization: `Bearer ${rawKey}` };
}

function promptMessages(): { role: string; content: unknown }[] {
	return (capturedOptions as { prompt: { role: string; content: unknown }[] }).prompt;
}

function promptText(message: { role: string; content: unknown }): string {
	if (typeof message.content === 'string') return message.content;
	return (message.content as { type: string; text?: string }[])
		.filter((part) => part.type === 'text')
		.map((part) => part.text)
		.join('');
}

function compressionRow(): Record<string, unknown> | null {
	const row = listProxyRequests(getDb(), {}).rows[0];
	return row?.compression ? (JSON.parse(row.compression) as Record<string, unknown>) : null;
}

beforeEach(async () => {
	closeDb();
	const db = getDb();
	db.prepare(
		`INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt", role) VALUES ('u1','a@b.c','A',0,0,0,'user')`
	).run();
	const providerId = createProvider(db, { name: 'P', type: 'anthropic' }).id;
	createModel(db, { providerId, modelId: 'm1' });
	rawKey = (await createApiKey(db, { userId: 'u1', label: 'k', scopes: ['llm:invoke'] })).rawKey;
	capturedOptions = undefined;
});

describe('proxy compression: caveman', () => {
	it('merges the caveman prompt into the client system message', async () => {
		setUserSetting(getDb(), 'u1', 'proxyCaveman', 'full');
		const res = await callResponse(POST_CHAT, {
			headers: auth(),
			body: {
				model: 'm1',
				messages: [
					{ role: 'system', content: 'client system' },
					{ role: 'user', content: 'hi' }
				]
			}
		});
		expect(res.status).toBe(200);

		const prompt = promptMessages();
		const systems = prompt.filter((m) => m.role === 'system');
		expect(systems.length).toBe(1);
		expect(systems[0].content).toBe(`client system\n\n${CAVEMAN_PROMPTS.full}`);
		expect(prompt[prompt.length - 1].role).toBe('user');
		expect(promptText(prompt[prompt.length - 1])).toBe('hi');

		const compression = compressionRow();
		expect(compression).toEqual({
			caveman: {
				level: 'full',
				estSaved: Math.round((2 * 0.65) / 0.35),
				overhead: cavemanOverheadTokens('full'),
				basis: 'ratio'
			}
		});
	});

	it('appends caveman after client instructions on the responses endpoint', async () => {
		setUserSetting(getDb(), 'u1', 'proxyCaveman', 'lite');
		const res = await callResponse(POST_RESPONSES, {
			headers: auth(),
			url: 'http://localhost/api/v1/responses',
			body: { model: 'm1', instructions: 'Be terse', input: 'hi' }
		});
		expect(res.status).toBe(200);

		const prompt = promptMessages();
		expect(prompt[0].role).toBe('system');
		const content = prompt[0].content as string;
		expect(content.startsWith('Be terse\n\n')).toBe(true);
		expect(content).toContain('smart caveman');
		expect(content).toContain('Intensity: lite.');

		const compression = compressionRow() as { caveman: { level: string; basis: string } };
		expect(compression.caveman.level).toBe('lite');
		expect(compression.caveman.basis).toBe('ratio');
	});

	it('records caveman compression on streaming completions too', async () => {
		setUserSetting(getDb(), 'u1', 'proxyCaveman', 'ultra');
		const res = await callResponse(POST_CHAT, {
			headers: auth(),
			body: { model: 'm1', messages: [{ role: 'user', content: 'hi' }], stream: true }
		});
		expect(res.status).toBe(200);
		await res.text();

		const compression = compressionRow() as { caveman: { level: string; estSaved: number } };
		expect(compression.caveman.level).toBe('ultra');
		expect(compression.caveman.estSaved).toBe(Math.round((2 * 0.75) / 0.25));
	});
});

describe('proxy compression: baseline', () => {
	it('records the rolling baseline on complete when caveman is off', async () => {
		const res = await callResponse(POST_CHAT, {
			headers: auth(),
			body: { model: 'm1', messages: [{ role: 'user', content: 'hi' }] }
		});
		expect(res.status).toBe(200);
		expect(getUserSetting(getDb(), 'u1', 'cavemanBaseline')).toEqual({ avg: 2, samples: 1 });
	});

	it('does not record the baseline when caveman is on', async () => {
		setUserSetting(getDb(), 'u1', 'proxyCaveman', 'full');
		const res = await callResponse(POST_CHAT, {
			headers: auth(),
			body: { model: 'm1', messages: [{ role: 'user', content: 'hi' }] }
		});
		expect(res.status).toBe(200);
		expect(getUserSetting(getDb(), 'u1', 'cavemanBaseline')).toBeUndefined();
	});
});

describe('proxy compression: disabled', () => {
	it('stores no compression metadata when both features are off', async () => {
		const res = await callResponse(POST_CHAT, {
			headers: auth(),
			body: { model: 'm1', messages: [{ role: 'user', content: 'hi' }] }
		});
		expect(res.status).toBe(200);
		expect(compressionRow()).toBeNull();
	});
});
