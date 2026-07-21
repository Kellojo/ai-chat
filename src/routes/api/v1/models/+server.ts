import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/index.js';
import { listOpenAiModels } from '$lib/server/proxy/handler.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => json(listOpenAiModels(getDb()));
