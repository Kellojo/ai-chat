<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatDateTime } from '$lib/datetime.js';
	import type { Agent } from '$lib/types.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let runBusy = $state<string | null>(null);
	let deleteTarget = $state<Agent | null>(null);
	let deleteBusy = $state(false);

	$effect(() => {
		const refreshIfVisible = () => {
			if (document.visibilityState === 'visible') invalidateAll();
		};
		const interval = setInterval(refreshIfVisible, 5000);
		document.addEventListener('visibilitychange', refreshIfVisible);
		return () => {
			clearInterval(interval);
			document.removeEventListener('visibilitychange', refreshIfVisible);
		};
	});

	async function runNow(agent: Agent) {
		if (runBusy) return;
		runBusy = agent.id;
		try {
			const res = await fetch(`/api/agents/${agent.id}/run`, { method: 'POST' });
			const body = (await res.json().catch(() => null)) as {
				ignored?: boolean;
				message?: string;
			} | null;
			if (!res.ok) throw new Error(body?.message ?? `Request failed (${res.status})`);
			if (body?.ignored) toast(body.message ?? 'Run ignored');
			else toast.success('Run started');
			await invalidateAll();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to start run');
		} finally {
			runBusy = null;
		}
	}

	async function confirmDelete() {
		if (!deleteTarget || deleteBusy) return;
		deleteBusy = true;
		try {
			const res = await fetch(`/api/agents/${deleteTarget.id}`, { method: 'DELETE' });
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { message?: string } | null;
				throw new Error(body?.message ?? `Request failed (${res.status})`);
			}
			toast.success('Agent deleted');
			deleteTarget = null;
			await invalidateAll();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to delete agent');
		} finally {
			deleteBusy = false;
		}
	}
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
	<div class="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
		<div class="flex items-center justify-between">
			<h1 class="text-xl font-semibold">Agents</h1>
			<Button href={resolve('/agents/new')}>New agent</Button>
		</div>

		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Agent</Table.Head>
					<Table.Head>Trigger</Table.Head>
					<Table.Head>Status</Table.Head>
					<Table.Head>Next run</Table.Head>
					<Table.Head>Last run</Table.Head>
					<Table.Head class="text-right">Actions</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.agents as agent (agent.id)}
					<Table.Row>
						<Table.Cell class="max-w-72">
							<div class="flex items-center gap-2">
								<span class="truncate font-medium" title={agent.name}>{agent.name}</span>
								{#if data.runningAgentIds.includes(agent.id)}
									<LoaderCircleIcon
										class="size-3.5 shrink-0 animate-spin text-blue-600 dark:text-blue-400"
										title="Running"
									/>
								{/if}
								{#if agent.userId === null}
									<Badge variant="outline">Built-in</Badge>
								{/if}
							</div>
							{#if agent.description}
								<p class="line-clamp-2 text-sm text-muted-foreground" title={agent.description}>
									{agent.description}
								</p>
							{/if}
						</Table.Cell>
						<Table.Cell>
							<Badge variant="secondary">{agent.triggerType}</Badge>
						</Table.Cell>
						<Table.Cell>
							{#if agent.enabled}
								<Badge variant="secondary">Enabled</Badge>
							{:else}
								<Badge variant="outline" class="text-muted-foreground">Disabled</Badge>
							{/if}
						</Table.Cell>
						<Table.Cell class="whitespace-nowrap text-muted-foreground">
							{agent.nextRunAt ? formatDateTime(agent.nextRunAt, data.timeFormat) : '—'}
						</Table.Cell>
						<Table.Cell class="whitespace-nowrap text-muted-foreground">
							{agent.lastRunAt ? formatDateTime(agent.lastRunAt, data.timeFormat) : '—'}
						</Table.Cell>
						<Table.Cell class="text-right whitespace-nowrap">
							<div class="flex justify-end gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={runBusy !== null}
									onclick={() => runNow(agent)}
								>
									{#if runBusy === agent.id}
										<LoaderCircleIcon class="size-3.5 animate-spin" />
										Starting…
									{:else}
										Run now
									{/if}
								</Button>
								<Button variant="ghost" size="sm" href={resolve(`/agents/${agent.id}/runs`)}>
									Runs
								</Button>
								{#if agent.userId !== null}
									<Button variant="ghost" size="sm" href={resolve(`/agents/${agent.id}`)}>
										Edit
									</Button>
									<Button variant="destructive" size="sm" onclick={() => (deleteTarget = agent)}>
										Delete
									</Button>
								{/if}
							</div>
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={6} class="text-center text-muted-foreground">
							No agents yet. Create one to get started.
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</div>

<Dialog.Root open={deleteTarget !== null} onOpenChange={(open) => !open && (deleteTarget = null)}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete agent?</Dialog.Title>
			<Dialog.Description>
				"{deleteTarget?.name}" and its run history will be permanently deleted.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (deleteTarget = null)}>Cancel</Button>
			<Button variant="destructive" disabled={deleteBusy} onclick={confirmDelete}>
				{deleteBusy ? 'Deleting…' : 'Delete'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
