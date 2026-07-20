import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '$lib/server/auth/index.js';
import { seedBuiltinAgent, seedMemoryCleanupAgent } from '$lib/server/agents/builtin.js';
import { startAgentEventDispatcher } from '$lib/server/agents/events.js';
import { startAgentScheduler } from '$lib/server/agents/scheduler.js';
import { getDb } from '$lib/server/db/index.js';
import { failRunningAgentRuns } from '$lib/server/db/repo/agent-runs.js';
import { seedBuiltinProviders } from '$lib/server/db/seed.js';
import { reconcileMemoryFts } from '$lib/server/memory/fts.js';

if (!building) {
	seedBuiltinProviders(getDb());
	seedBuiltinAgent(getDb());
	seedMemoryCleanupAgent(getDb());
	const interrupted = failRunningAgentRuns(getDb());
	if (interrupted > 0) {
		console.warn(`Marked ${interrupted} interrupted agent run(s) as failed`);
	}
	const { upserted, removed } = reconcileMemoryFts(getDb());
	if (upserted > 0 || removed > 0) {
		console.log(`Memory index reconciled: ${upserted} upserted, ${removed} removed`);
	}
	startAgentEventDispatcher();
	startAgentScheduler(getDb());
}

const authRoutes: Handle = ({ event, resolve }) =>
	svelteKitHandler({ event, resolve, auth, building });

const sessionHandle: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.session = session?.session ?? null;
	event.locals.user = session?.user ?? null;
	return resolve(event);
};

export const handle: Handle = sequence(authRoutes, sessionHandle);
