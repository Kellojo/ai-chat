import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '$lib/server/auth/index.js';
import { getDb } from '$lib/server/db/index.js';
import { seedBuiltinProviders } from '$lib/server/db/seed.js';

if (!building) {
	seedBuiltinProviders(getDb());
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
