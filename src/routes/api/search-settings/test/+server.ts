import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { requireAdmin } from '$lib/server/auth/guards.js';
import type { RequestHandler } from './$types';

const postSchema = z.object({
	baseUrl: z.string().url(),
	timeoutMs: z.number().int().min(1000).max(60000).optional()
});

export const POST: RequestHandler = async ({ locals, request }) => {
	requireAdmin(locals);
	const parsed = postSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, { message: 'Invalid request body' });
	const { baseUrl, timeoutMs } = parsed.data;

	const url = `${baseUrl.replace(/\/+$/, '')}/search?q=ping&format=json`;
	const start = Date.now();
	try {
		const res = await fetch(url, {
			headers: { 'user-agent': 'ai-chat/0.1 (+https://localhost)' },
			signal: AbortSignal.timeout(timeoutMs ?? 15000)
		});
		const latencyMs = Date.now() - start;
		if (!res.ok) {
			return json({ ok: false, latencyMs, error: `HTTP ${res.status}` });
		}
		const data = (await res.json()) as { results?: unknown[] };
		return json({
			ok: true,
			latencyMs,
			resultCount: Array.isArray(data.results) ? data.results.length : 0
		});
	} catch (e) {
		return json({
			ok: false,
			latencyMs: Date.now() - start,
			error: e instanceof Error ? e.message : String(e)
		});
	}
};
