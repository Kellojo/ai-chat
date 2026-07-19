<script lang="ts">
	import Sidebar from '$lib/components/app/Sidebar.svelte';
	import PanelLeftIcon from '@lucide/svelte/icons/panel-left';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	let sidebarOpen = $state(true);
</script>

<div class="flex h-screen overflow-hidden">
	<div
		class="h-full shrink-0 overflow-hidden transition-[width] duration-200"
		style:width={sidebarOpen ? '288px' : '0px'}
	>
		<Sidebar
			user={data.user}
			conversations={data.conversations}
			onclose={() => (sidebarOpen = false)}
		/>
	</div>
	<main
		class="relative flex min-w-0 flex-1 flex-col transition-[padding] duration-200 {sidebarOpen
			? ''
			: 'pl-12'}"
	>
		{#if !sidebarOpen}
			<button
				class="absolute top-2 left-2 z-10 rounded-md border bg-background p-1.5 text-muted-foreground hover:text-foreground"
				onclick={() => (sidebarOpen = true)}
				aria-label="Open sidebar"
			>
				<PanelLeftIcon class="size-4" />
			</button>
		{/if}
		{@render children()}
	</main>
</div>
