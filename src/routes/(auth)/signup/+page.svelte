<script lang="ts">
	import { authClient } from '$lib/auth-client.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let errorMessage = $state('');
	let loading = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		loading = true;
		errorMessage = '';
		const { error } = await authClient.signUp.email({
			name,
			email,
			password,
			callbackURL: '/'
		});
		if (error) {
			errorMessage = error.message ?? 'Sign up failed';
			loading = false;
			return;
		}
		await goto(resolve('/'));
	}
</script>

<main class="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
	<h1 class="text-2xl font-semibold">Create account</h1>

	{#if data.authConfig.signup}
		<form onsubmit={submit} class="flex flex-col gap-3">
			<label class="flex flex-col gap-1">
				<span class="text-sm font-medium">Name</span>
				<input
					type="text"
					bind:value={name}
					required
					autocomplete="name"
					class="rounded-md border px-3 py-2"
				/>
			</label>
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
					minlength="8"
					autocomplete="new-password"
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
				{loading ? 'Creating account…' : 'Sign up'}
			</button>
		</form>
	{:else}
		<p class="text-sm">Sign-up is disabled.</p>
	{/if}

	<p class="text-sm">
		Already have an account? <a href={resolve('/login')} class="underline">Sign in</a>
	</p>
</main>
