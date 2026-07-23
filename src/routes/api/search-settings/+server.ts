import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { requireAdmin } from '$lib/server/auth/guards.js';
import { getDb } from '$lib/server/db/index.js';
import { getSetting, setSetting } from '$lib/server/db/repo/settings.js';
import type { RequestHandler } from './$types';

const SAFE_SEARCH_VALUES = [0, 1, 2] as const;

export interface SearchSettings {
	provider: 'searxng';
	baseUrl: string;
	defaultLimit: number;
	timeoutMs: number;
	safeSearch: 0 | 1 | 2;
	language: string;
}

function readSettings(db: ReturnType<typeof getDb>): SearchSettings {
	const baseUrl = getSetting<string>(db, 'websearch.searxng.base_url') ?? '';
	const defaultLimitRaw = getSetting<number>(db, 'websearch.default_limit');
	const timeoutRaw = getSetting<number>(db, 'websearch.timeout_ms');
	const safeSearchRaw = getSetting<number>(db, 'websearch.safe_search');
	const language = getSetting<string>(db, 'websearch.language') ?? 'auto';
	return {
		provider: 'searxng',
		baseUrl,
		defaultLimit:
			typeof defaultLimitRaw === 'number' && defaultLimitRaw >= 1 && defaultLimitRaw <= 10
				? Math.floor(defaultLimitRaw)
				: 5,
		timeoutMs:
			typeof timeoutRaw === 'number' && timeoutRaw >= 1000 && timeoutRaw <= 60000
				? Math.floor(timeoutRaw)
				: 15000,
		safeSearch: SAFE_SEARCH_VALUES.includes(safeSearchRaw as 0 | 1 | 2)
			? (safeSearchRaw as 0 | 1 | 2)
			: 1,
		language
	};
}

const putSchema = z.object({
	baseUrl: z.string().url().or(z.literal('')),
	defaultLimit: z.number().int().min(1).max(10),
	timeoutMs: z.number().int().min(1000).max(60000),
	safeSearch: z.union([z.literal(0), z.literal(1), z.literal(2)]),
	language: z
		.string()
		.regex(/^([a-z]{2}(-[A-Z]{2})?|auto)$/)
		.max(20)
});

export const GET: RequestHandler = ({ locals }) => {
	requireAdmin(locals);
	return json({ settings: readSettings(getDb()) });
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	requireAdmin(locals);
	const parsed = putSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, { message: 'Invalid request body' });
	const db = getDb();
	const body = parsed.data;
	setSetting(db, 'websearch.provider', 'searxng');
	setSetting(db, 'websearch.searxng.base_url', body.baseUrl.replace(/\/+$/, ''));
	setSetting(db, 'websearch.default_limit', body.defaultLimit);
	setSetting(db, 'websearch.timeout_ms', body.timeoutMs);
	setSetting(db, 'websearch.safe_search', body.safeSearch);
	setSetting(db, 'websearch.language', body.language);
	return json({ settings: readSettings(db) });
};
