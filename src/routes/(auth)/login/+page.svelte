<script lang="ts">
	import { authClient } from '$lib/auth-client.js';
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let email = $state('');
	let password = $state('');
	let errorMessage = $state('');
	let loading = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		loading = true;
		errorMessage = '';
		const { error } = await authClient.signIn.email({
			email,
			password,
			callbackURL: '/'
		});
		if (error) {
			errorMessage = error.message ?? 'Sign in failed';
			loading = false;
		}
	}

	async function signInWithOidc() {
		await authClient.signIn.oauth2({ providerId: 'oidc', callbackURL: '/' });
	}
</script>

<main class="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
	<h1 class="text-2xl font-semibold">Sign in</h1>

	{#if data.authConfig.passwordLogin}
		<form onsubmit={submit} class="flex flex-col gap-3">
			<label class="flex flex-col gap-1">
				<span class="text-sm font-medium">Email</span>
				<input
					type="email"
					bind:value={email}
					required
					autocomplete="email"
					class="rounded-md border px-3 py-2"
				/>
			</label>
			<label class="flex flex-col gap-1">
				<span class="text-sm font-medium">Password</span>
				<input
					type="password"
					bind:value={password}
					required
					autocomplete="current-password"
					class="rounded-md border px-3 py-2"
				/>
			</label>
			{#if errorMessage}
				<p class="text-sm text-red-600">{errorMessage}</p>
			{/if}
			<button
				type="submit"
				disabled={loading}
				class="rounded-md bg-black px-3 py-2 text-white disabled:opacity-50"
			>
				{loading ? 'Signing in…' : 'Sign in'}
			</button>
		</form>
	{/if}

	{#if data.authConfig.oidc}
		<button onclick={signInWithOidc} class="rounded-md border px-3 py-2"> Sign in with SSO </button>
	{/if}

	{#if data.authConfig.signup}
		<p class="text-sm">
			No account? <a href={resolve('/signup')} class="underline">Sign up</a>
		</p>
	{/if}
</main>
