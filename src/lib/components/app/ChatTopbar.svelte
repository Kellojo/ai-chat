<script lang="ts">
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import SettingsIcon from '@lucide/svelte/icons/settings-2';
	import ModelPicker from './ModelPicker.svelte';
	import type { Conversation, ModelsByProvider } from '$lib/types.js';

	let {
		conversation,
		groups,
		onupdated
	}: {
		conversation: Conversation;
		groups: ModelsByProvider[];
		onupdated: (c: Conversation) => void;
	} = $props();

	let settingsOpen = $state(false);
	let saving = $state(false);

	const currentModelValue = $derived(
		conversation.providerId && conversation.modelId
			? `${conversation.providerId}/${conversation.modelId}`
			: ''
	);

	async function patch(body: Record<string, unknown>) {
		saving = true;
		try {
			const res = await fetch(`/api/conversations/${conversation.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				const data = await res.json().catch(() => null);
				throw new Error(data?.message ?? 'Failed to update conversation');
			}
			const { conversation: updated } = (await res.json()) as { conversation: Conversation };
			onupdated(updated);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to update conversation');
		} finally {
			saving = false;
		}
	}

	function selectModel(value: string) {
		const [providerId, ...rest] = value.split('/');
		patch({ providerId, modelId: rest.join('/') });
	}
</script>

<header class="flex items-center gap-3 border-b px-4 py-2">
	<ModelPicker {groups} value={currentModelValue} onselect={selectModel} disabled={saving} />

	<div class="ml-auto flex items-center gap-3">
		<Label class="flex items-center gap-2 text-sm text-muted-foreground">
			Agent mode
			<Switch
				checked={conversation.mode === 'agent'}
				disabled={saving}
				onCheckedChange={(v) => patch({ mode: v ? 'agent' : 'chat' })}
			/>
		</Label>
		<Button
			variant="ghost"
			size="icon"
			aria-label="Conversation settings"
			onclick={() => (settingsOpen = true)}
		>
			<SettingsIcon class="size-4" />
		</Button>
	</div>
</header>

<Dialog.Root bind:open={settingsOpen}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Conversation settings</Dialog.Title>
		</Dialog.Header>
		<div class="flex flex-col gap-4">
			<div class="flex items-center justify-between gap-4">
				<Label for="memory-enabled">Memory</Label>
				<Switch
					id="memory-enabled"
					checked={conversation.memoryEnabled}
					disabled={saving}
					onCheckedChange={(v) => patch({ memoryEnabled: v })}
				/>
			</div>
			<div class="flex flex-col gap-2">
				<Label for="system-prompt">System prompt</Label>
				<Textarea
					id="system-prompt"
					rows={5}
					value={conversation.systemPrompt ?? ''}
					placeholder="Override the default system prompt…"
					onchange={(e) => {
						const v = e.currentTarget.value.trim();
						patch({ systemPrompt: v === '' ? null : v });
					}}
				/>
			</div>
			<div class="grid grid-cols-3 gap-3">
				<div class="flex flex-col gap-2">
					<Label for="max-steps">Max steps</Label>
					<Input
						id="max-steps"
						type="number"
						min={1}
						max={100}
						value={conversation.maxSteps?.toString() ?? ''}
						placeholder="Default"
						onchange={(e) => {
							const v = e.currentTarget.value;
							patch({ maxSteps: v === '' ? null : Number(v) });
						}}
					/>
				</div>
				<div class="flex flex-col gap-2">
					<Label for="temperature">Temperature</Label>
					<Input
						id="temperature"
						type="number"
						min={0}
						max={2}
						step={0.1}
						value={conversation.temperature?.toString() ?? ''}
						placeholder="Default"
						onchange={(e) => {
							const v = e.currentTarget.value;
							patch({ temperature: v === '' ? null : Number(v) });
						}}
					/>
				</div>
				<div class="flex flex-col gap-2">
					<Label for="max-tokens">Max tokens</Label>
					<Input
						id="max-tokens"
						type="number"
						min={1}
						value={conversation.maxTokens?.toString() ?? ''}
						placeholder="Default"
						onchange={(e) => {
							const v = e.currentTarget.value;
							patch({ maxTokens: v === '' ? null : Number(v) });
						}}
					/>
				</div>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
