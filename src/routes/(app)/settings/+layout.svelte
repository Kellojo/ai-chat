<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	const sections = [
		{ href: '/settings/account', label: 'Account', adminOnly: false },
		{ href: '/settings/providers', label: 'Providers', adminOnly: true },
		{ href: '/settings/models', label: 'Models', adminOnly: true },
		{ href: '/settings/mcp', label: 'MCP', adminOnly: true },
		{ href: '/settings/defaults', label: 'Model Defaults', adminOnly: true }
	] as const;

	const isAdmin = $derived(data.user.role === 'admin');
	const visibleSections = $derived(sections.filter((section) => !section.adminOnly || isAdmin));
</script>

<div class="mx-auto flex w-full max-w-7xl gap-8 p-6">
	<nav class="flex w-40 shrink-0 flex-col gap-1">
		<h1 class="mb-2 px-3 text-lg font-semibold">Settings</h1>
		{#each visibleSections as section (section.href)}
			<a
				href={resolve(section.href)}
				class="rounded-md px-3 py-1.5 text-sm {page.url.pathname.startsWith(section.href)
					? 'bg-accent font-medium text-accent-foreground'
					: 'text-muted-foreground hover:bg-accent/50'}"
			>
				{section.label}
			</a>
		{/each}
	</nav>
	<main class="min-w-0 flex-1">
		{@render children()}
	</main>
</div>
