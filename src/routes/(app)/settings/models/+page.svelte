<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Model = PageData['models'][number];
	type Role = NonNullable<Model['isDefaultFor']>;
	type Capability = 'chat' | 'vision' | 'tool_use' | 'streaming';

	const roleLabels: Record<Role, string> = {
		chat: 'Default chat',
		memory: 'Memory',
		research: 'Research'
	};
	const allCapabilities: Capability[] = ['chat', 'vision', 'tool_use', 'streaming'];

	let addOpen = $state(false);
	let addProviderId = $state('');
	let addModelId = $state('');
	let addDisplayName = $state('');
	let addBusy = $state(false);

	let capsModel = $state<Model | null>(null);
	let capsSelected = $state<Capability[]>([]);
	let capsBusy = $state(false);

	let deleteId = $state<string | null>(null);
	let deleteBusy = $state(false);

	const providersById = $derived(new Map(data.providers.map((p) => [p.id, p])));

	function modelsFor(providerId: string): Model[] {
		return data.models.filter((m) => m.providerId === providerId);
	}

	async function api(path: string, method: string, body?: unknown): Promise<Response> {
		const res = await fetch(path, {
			method,
			headers: body === undefined ? undefined : { 'content-type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		if (!res.ok) {
			const payload = (await res.json().catch(() => null)) as { message?: string } | null;
			throw new Error(payload?.message ?? `Request failed (${res.status})`);
		}
		return res;
	}

	async function patch(id: string, body: unknown, successMessage: string) {
		try {
			await api(`/api/models/${id}`, 'PATCH', body);
			toast.success(successMessage);
			await invalidateAll();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to update model');
		}
	}

	async function submitAdd(event: SubmitEvent) {
		event.preventDefault();
		addBusy = true;
		try {
			await api('/api/models', 'POST', {
				providerId: addProviderId,
				modelId: addModelId,
				displayName: addDisplayName || undefined
			});
			toast.success(`Model "${addModelId}" added`);
			addOpen = false;
			addModelId = '';
			addDisplayName = '';
			await invalidateAll();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to add model');
		} finally {
			addBusy = false;
		}
	}

	function openCaps(model: Model) {
		capsModel = model;
		capsSelected = model.capabilities.filter((c): c is Capability =>
			allCapabilities.includes(c as Capability)
		);
	}

	function toggleCap(cap: Capability) {
		capsSelected = capsSelected.includes(cap)
			? capsSelected.filter((c) => c !== cap)
			: [...capsSelected, cap];
	}

	async function submitCaps() {
		if (!capsModel) return;
		capsBusy = true;
		try {
			await api(`/api/models/${capsModel.id}`, 'PATCH', { capabilities: capsSelected });
			toast.success('Capabilities updated');
			capsModel = null;
			await invalidateAll();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to update capabilities');
		} finally {
			capsBusy = false;
		}
	}

	async function confirmDelete() {
		if (!deleteId) return;
		deleteBusy = true;
		try {
			await api(`/api/models/${deleteId}`, 'DELETE');
			toast.success('Model deleted');
			deleteId = null;
			await invalidateAll();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to delete model');
		} finally {
			deleteBusy = false;
		}
	}
</script>

<div class="flex flex-col gap-4">
	<div class="flex items-center justify-between">
		<h2 class="text-xl font-semibold">Models</h2>
		<Button onclick={() => (addOpen = true)} disabled={data.providers.length === 0}>
			Add model
		</Button>
	</div>

	{#each data.providers as provider (provider.id)}
		{@const models = modelsFor(provider.id)}
		<Card.Root class={provider.enabled ? '' : 'opacity-60'}>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					{provider.name}
					{#if !provider.enabled}<Badge variant="outline">disabled</Badge>{/if}
				</Card.Title>
			</Card.Header>
			<Card.Content>
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Display name</Table.Head>
							<Table.Head>Model ID</Table.Head>
							<Table.Head>Capabilities</Table.Head>
							<Table.Head>Enabled</Table.Head>
							<Table.Head>Default for</Table.Head>
							<Table.Head class="text-right">Actions</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each models as model (model.id)}
							<Table.Row>
								<Table.Cell class="font-medium">{model.displayName}</Table.Cell>
								<Table.Cell class="text-muted-foreground">{model.modelId}</Table.Cell>
								<Table.Cell>
									<div class="flex flex-wrap gap-1">
										{#each model.capabilities as cap (cap)}
											<Badge variant="secondary">{cap}</Badge>
										{/each}
									</div>
								</Table.Cell>
								<Table.Cell>
									<Switch
										checked={model.enabled}
										onCheckedChange={(checked) =>
											patch(model.id, { enabled: checked }, 'Model updated')}
									/>
								</Table.Cell>
								<Table.Cell>
									<Select.Root
										type="single"
										value={model.isDefaultFor ?? ''}
										onValueChange={(value) =>
											patch(
												model.id,
												{ isDefaultFor: value === '' ? null : value },
												'Role assignment updated'
											)}
									>
										<Select.Trigger size="sm" class="w-36">
											{model.isDefaultFor ? roleLabels[model.isDefaultFor] : '—'}
										</Select.Trigger>
										<Select.Content>
											<Select.Item value="">—</Select.Item>
											{#each Object.entries(roleLabels) as [value, label] (value)}
												<Select.Item {value}>{label}</Select.Item>
											{/each}
										</Select.Content>
									</Select.Root>
								</Table.Cell>
								<Table.Cell class="text-right">
									<div class="flex justify-end gap-2">
										<Button variant="outline" size="sm" onclick={() => openCaps(model)}>
											Capabilities
										</Button>
										<Button variant="destructive" size="sm" onclick={() => (deleteId = model.id)}>
											Delete
										</Button>
									</div>
								</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell colspan={6} class="text-center text-muted-foreground">
									No models. Use "Fetch models" on the Providers page or add one manually.
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{:else}
		<p class="text-muted-foreground">No providers configured yet.</p>
	{/each}

	<Separator />
	<p class="text-sm text-muted-foreground">
		Role assignments pick the model used for new chats, the memory extraction job, and research
		sessions. Each role can have one model.
	</p>
</div>

<Dialog.Root bind:open={addOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Add model</Dialog.Title>
			<Dialog.Description>Register a model entry manually.</Dialog.Description>
		</Dialog.Header>
		<form onsubmit={submitAdd} class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<Label>Provider</Label>
				<Select.Root type="single" bind:value={addProviderId}>
					<Select.Trigger class="w-full">
						{addProviderId ? providersById.get(addProviderId)?.name : 'Select a provider'}
					</Select.Trigger>
					<Select.Content>
						{#each data.providers as provider (provider.id)}
							<Select.Item value={provider.id}>{provider.name}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
			<div class="flex flex-col gap-2">
				<Label for="add-modelid">Model ID</Label>
				<Input id="add-modelid" bind:value={addModelId} required placeholder="claude-sonnet-4-5" />
			</div>
			<div class="flex flex-col gap-2">
				<Label for="add-displayname">Display name (optional)</Label>
				<Input id="add-displayname" bind:value={addDisplayName} />
			</div>
			<Dialog.Footer>
				<Button type="submit" disabled={addBusy || !addProviderId}>
					{addBusy ? 'Adding…' : 'Add model'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root open={capsModel !== null} onOpenChange={(open) => !open && (capsModel = null)}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Capabilities — {capsModel?.displayName}</Dialog.Title>
			<Dialog.Description>
				Vision enables image attachments; tool use is required for MCP tools.
			</Dialog.Description>
		</Dialog.Header>
		<div class="flex flex-col gap-3">
			{#each allCapabilities as cap (cap)}
				<label class="flex items-center gap-3 text-sm">
					<Switch checked={capsSelected.includes(cap)} onCheckedChange={() => toggleCap(cap)} />
					{cap}
				</label>
			{/each}
		</div>
		<Dialog.Footer>
			<Button disabled={capsBusy} onclick={submitCaps}>
				{capsBusy ? 'Saving…' : 'Save capabilities'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root open={deleteId !== null} onOpenChange={(open) => !open && (deleteId = null)}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete model?</Dialog.Title>
			<Dialog.Description>
				Conversations that used this model keep their history but cannot continue with it.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (deleteId = null)}>Cancel</Button>
			<Button variant="destructive" disabled={deleteBusy} onclick={confirmDelete}>
				{deleteBusy ? 'Deleting…' : 'Delete'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
