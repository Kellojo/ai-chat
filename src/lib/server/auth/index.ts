import { betterAuth } from 'better-auth';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { authOptions } from './options.js';

const options = authOptions();

export const auth = betterAuth({
	...options,
	plugins: [...(options.plugins ?? []), sveltekitCookies(getRequestEvent)]
});

export type AuthSession = typeof auth.$Infer.Session;
