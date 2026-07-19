<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import BotIcon from '@lucide/svelte/icons/bot';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PinIcon from '@lucide/svelte/icons/pin';
	import PinOffIcon from '@lucide/svelte/icons/pin-off';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import XIcon from '@lucide/svelte/icons/x';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { authClient } from '$lib/auth-client.js';
	import type { Conversation } from '$lib/types.js';

	let {
		user,
		conversations,
		onclose
	}: {
		user: { name: string; email: string };
		conversations: Conversation[];
		onclose: () => void;
	} = $props();

	let query = $state('');
	let searchResults = $state<Conversation[] | null>(null);
	let renameTarget = $state<Conversation | null>(null);
	let renameText = $state('');
	let deleteTarget = $state<Conversation | null>(null);
	let agentStats = $state<{ running: number; total: number } | null>(null);

	function refreshAgentStats() {
		fetch('/api/agents/stats')
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => {
				if (d) agentStats = d;
			})
			.catch(() => {});
	}

	onMount(() => {
		refreshAgentStats();
		const refreshIfVisible = () => {
			if (document.visibilityState === 'visible') refreshAgentStats();
		};
		const interval = setInterval(refreshIfVisible, 5000);
		document.addEventListener('visibilitychange', refreshIfVisible);
		return () => {
			clearInterval(interval);
			document.removeEventListener('visibilitychange', refreshIfVisible);
		};
	});

	const currentId = $derived(page.params.id ?? '');

	type Group = { label: string; items: Conversation[] };

	function groupByDate(items: Conversation[]): Group[] {
		const now = new Date();
		const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
		const day = 24 * 60 * 60 * 1000;
		const groups: Group[] = [
			{ label: 'Pinned', items: [] },
			{ label: 'Today', items: [] },
			{ label: 'Yesterday', items: [] },
			{ label: 'This week', items: [] },
			{ label: 'Older', items: [] }
		];
		for (const c of items) {
			if (c.pinned) groups[0].items.push(c);
			else if (c.updatedAt >= startOfDay) groups[1].items.push(c);
			else if (c.updatedAt >= startOfDay - day) groups[2].items.push(c);
			else if (c.updatedAt >= startOfDay - 7 * day) groups[3].items.push(c);
			else groups[4].items.push(c);
		}
		return groups.filter((g) => g.items.length > 0);
	}

	const visibleGroups = $derived(groupByDate(searchResults ?? conversations));

	async function search() {
		const q = query.trim();
		if (!q) {
			searchResults = null;
			return;
		}
		const res = await fetch(`/api/conversations/search?q=${encodeURIComponent(q)}`);
		if (res.ok) {
			searchResults = ((await res.json()) as { conversations: Conversation[] }).conversations;
		}
	}

	async function newChat() {
		query = '';
		searchResults = null;
		goto(resolve('/'));
	}

	async function togglePin(event: MouseEvent, id: string) {
		event.stopPropagation();
		await fetch(`/api/conversations/${id}/pin`, { method: 'POST' });
		await invalidateAll();
	}

	function openRename(event: MouseEvent, c: Conversation) {
		event.stopPropagation();
		renameTarget = c;
		renameText = c.title;
	}

	async function submitRename(event: SubmitEvent) {
		event.preventDefault();
		if (!renameTarget) return;
		await fetch(`/api/conversations/${renameTarget.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title: renameText.trim() })
		});
		renameTarget = null;
		await invalidateAll();
	}

	async function confirmDelete() {
		if (!deleteTarget) return;
		const id = deleteTarget.id;
		deleteTarget = null;
		const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
		if (res.ok) {
			toast.success('Conversation deleted');
			if (currentId === id) await goto(resolve('/'));
			await invalidateAll();
		} else {
			toast.error('Failed to delete conversation');
		}
	}

	async function signOut() {
		await authClient.signOut();
		goto(resolve('/login'));
	}
</script>

<aside class="flex h-full w-72 shrink-0 flex-col border-r bg-muted/30">
	<div class="flex items-center justify-between gap-2 p-3">
		<span class="px-1 text-sm font-semibold">AI Chat</span>
		<div class="flex gap-1">
			<Button variant="outline" size="sm" onclick={newChat}>New chat</Button>
			<Button variant="ghost" size="sm" onclick={onclose} aria-label="Close sidebar">
				<XIcon class="size-4" />
			</Button>
		</div>
	</div>

	<div class="px-3 pb-2">
		<Input
			placeholder="Search conversations…"
			bind:value={query}
			oninput={search}
			class="h-8 text-sm"
		/>
	</div>

	<div class="px-2 pb-1">
		<a
			href={resolve('/agents')}
			class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm {page.url.pathname.startsWith(
				'/agents'
			)
				? 'bg-accent text-accent-foreground'
				: 'text-muted-foreground hover:bg-accent/50'}"
		>
			<BotIcon class="size-4" />
			Agents
			{#if agentStats}
				<span
					class="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums"
					title="{agentStats.running} running of {agentStats.total} agents"
				>
					{#if agentStats.running > 0}
						<span class="size-1.5 animate-pulse rounded-full bg-blue-500"></span>
					{/if}
					{agentStats.running}/{agentStats.total}
				</span>
			{/if}
		</a>
	</div>

	<nav class="flex-1 overflow-y-auto px-2 pb-2">
		{#each visibleGroups as group (group.label)}
			<p class="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">{group.label}</p>
			{#each group.items as c (c.id)}
				<div
					class="group flex w-full items-center rounded-md text-sm {c.id === currentId
						? 'bg-accent text-accent-foreground'
						: 'hover:bg-accent/50'}"
				>
					<a
						href={resolve(`/chat/${c.id}`)}
						class="min-w-0 flex-1 truncate px-2 py-1.5"
						title={c.title || 'New chat'}
					>
						{c.title || 'New chat'}
					</a>
					<span class="hidden shrink-0 gap-0.5 pr-1 group-hover:flex">
						<button
							class="rounded p-1 text-muted-foreground hover:text-foreground"
							title={c.pinned ? 'Unpin' : 'Pin'}
							onclick={(e) => togglePin(e, c.id)}
						>
							{#if c.pinned}<PinOffIcon class="size-4" />{:else}<PinIcon class="size-4" />{/if}
						</button>
						<button
							class="rounded p-1 text-muted-foreground hover:text-foreground"
							title="Rename"
							onclick={(e) => openRename(e, c)}
						>
							<PencilIcon class="size-4" />
						</button>
						<button
							class="rounded p-1 text-muted-foreground hover:text-destructive"
							title="Delete"
							onclick={(e) => {
								e.stopPropagation();
								deleteTarget = c;
							}}
						>
							<Trash2Icon class="size-4" />
						</button>
					</span>
				</div>
			{/each}
		{:else}
			<p class="px-2 pt-4 text-sm text-muted-foreground">
				{searchResults ? 'No matches.' : 'No conversations yet.'}
			</p>
		{/each}
	</nav>

	<div class="flex items-center justify-between gap-2 border-t p-3">
		<span class="min-w-0 truncate text-sm" title={user.email}>{user.name}</span>
		<div class="flex shrink-0 gap-1">
			<Button variant="ghost" size="sm" href={resolve('/settings')}>Settings</Button>
			<Button variant="ghost" size="sm" onclick={signOut}>Sign out</Button>
		</div>
	</div>
</aside>

<Dialog.Root open={renameTarget !== null} onOpenChange={(open) => !open && (renameTarget = null)}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Rename conversation</Dialog.Title>
		</Dialog.Header>
		<form onsubmit={submitRename} class="flex flex-col gap-4">
			<Input bind:value={renameText} maxlength={200} placeholder="Conversation title" />
			<Dialog.Footer>
				<Button type="submit">Save</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root open={deleteTarget !== null} onOpenChange={(open) => !open && (deleteTarget = null)}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete conversation?</Dialog.Title>
			<Dialog.Description>
				"{deleteTarget?.title || 'New chat'}" will be moved to trash and purged after 30 days.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (deleteTarget = null)}>Cancel</Button>
			<Button variant="destructive" onclick={confirmDelete}>Delete</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
