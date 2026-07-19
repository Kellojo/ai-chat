<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { ModelRole } from '$lib/types.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const roleDescriptions: { role: ModelRole; label: string; description: string }[] = [
		{
			role: 'chat',
			label: 'Default chat model',
			description: 'Used for new conversations when no model has been picked yet.'
		},
		{
			role: 'title',
			label: 'Title generation',
			description: 'Generates conversation titles. Falls back to the conversation model when unset.'
		},
		{
			role: 'memory',
			label: 'Memory',
			description: 'Used by the memory extraction job.'
		},
		{
			role: 'research',
			label: 'Research',
			description: 'Used for research sessions.'
		}
	];

	let busy = $state<ModelRole | null>(null);

	const modelsById = $derived(new Map(data.models.map((m) => [m.id, m])));
	const providersById = $derived(new Map(data.providers.map((p) => [p.id, p])));

	const enabledGroups = $derived(
		data.providers
			.filter((p) => p.enabled)
			.map((p) => ({
				provider: p,
				models: data.models.filter((m) => m.providerId === p.id && m.enabled)
			}))
			.filter((g) => g.models.length > 0)
	);

	function roleLabel(modelId: string | undefined): string {
		if (!modelId) return 'Not set';
		const model = modelsById.get(modelId);
		if (!model) return 'Not set';
		const provider = providersById.get(model.providerId);
		return `${model.displayName}${provider ? ` (${provider.name})` : ''}`;
	}

	async function setRole(role: ModelRole, value: string) {
		if (busy) return;
		busy = role;
		try {
			const res = await fetch('/api/roles', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ role, modelId: value === '' ? null : value })
			});
			if (!res.ok) {
				const payload = (await res.json().catch(() => null)) as { message?: string } | null;
				throw new Error(payload?.message ?? `Request failed (${res.status})`);
			}
			toast.success('Default updated');
			await invalidateAll();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to update default');
		} finally {
			busy = null;
		}
	}
</script>

<div class="flex flex-col gap-4">
	<h2 class="text-xl font-semibold">Model defaults</h2>
	<p class="text-sm text-muted-foreground">
		Pick which model serves each purpose. The same model can be used for all of them.
	</p>

	<Card.Root>
		<Card.Content class="flex flex-col gap-5 pt-6">
			{#each roleDescriptions as { role, label, description } (role)}
				<div class="flex items-center justify-between gap-6">
					<div class="flex min-w-0 flex-col gap-1">
						<Label>{label}</Label>
						<p class="text-sm text-muted-foreground">{description}</p>
					</div>
					<Select.Root
						type="single"
						value={data.roles[role] ?? ''}
						onValueChange={(value) => setRole(role, value)}
					>
						<Select.Trigger class="w-72 shrink-0" disabled={busy !== null}>
							{roleLabel(data.roles[role])}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="">Not set</Select.Item>
							{#each enabledGroups as group (group.provider.id)}
								<Select.Group>
									<Select.Label>{group.provider.name}</Select.Label>
									{#each group.models as model (model.id)}
										<Select.Item value={model.id}>{model.displayName}</Select.Item>
									{/each}
								</Select.Group>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>

	{#if enabledGroups.length === 0}
		<p class="text-sm text-muted-foreground">
			No enabled models yet. Add providers and models first.
		</p>
	{/if}
</div>
