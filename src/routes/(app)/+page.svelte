<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import {
		PromptInput,
		PromptInputTextarea,
		PromptInputActions
	} from '$lib/components/ai/prompt-input/index.js';
	import { PromptSuggestion } from '$lib/components/ai/prompt-suggestion/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ModelPicker from '$lib/components/app/ModelPicker.svelte';
	import { pendingMessage } from '$lib/state/pending-message.svelte.js';
	import { DEFAULT_SUGGESTIONS } from '$lib/user-settings.js';
	import type { Conversation } from '$lib/types.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let input = $state('');
	let busy = $state(false);
	let picked = $state('');

	const defaultModelValue = $derived(
		data.defaultModel ? `${data.defaultModel.providerId}/${data.defaultModel.modelId}` : ''
	);
	const selectedValue = $derived(picked || defaultModelValue);
	const hasModels = $derived(data.groups.some((g) => g.models.length > 0));
	const modelMissing = $derived(!hasModels || selectedValue === '');
	const canSend = $derived(input.trim().length > 0 && !busy && !modelMissing);
	const suggestions = $derived(
		data.suggestions.length > 0 ? data.suggestions : DEFAULT_SUGGESTIONS
	);

	async function startChat(text: string) {
		const trimmed = text.trim();
		if (!trimmed || busy || modelMissing) return;
		busy = true;
		try {
			const body: Record<string, string> = {};
			if (selectedValue) {
				const [providerId, ...rest] = selectedValue.split('/');
				body.providerId = providerId;
				body.modelId = rest.join('/');
			}
			const res = await fetch('/api/conversations', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) throw new Error('Failed to create conversation');
			const { conversation } = (await res.json()) as { conversation: Conversation };
			pendingMessage.set(trimmed);
			await invalidateAll();
			goto(resolve(`/chat/${conversation.id}`));
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to start chat');
			busy = false;
		}
	}
</script>

<div class="flex flex-1 flex-col items-center justify-center gap-8 p-6">
	<h1 class="text-2xl font-semibold">What can I help you with?</h1>
	<div class="w-full max-w-2xl">
		<PromptInput value={input} onValueChange={(v) => (input = v)} onSubmit={() => startChat(input)}>
			<PromptInputTextarea placeholder="Ask anything…" />
			<PromptInputActions class="justify-between">
				<ModelPicker
					groups={data.groups}
					value={selectedValue}
					onselect={(v) => (picked = v)}
					disabled={busy}
				/>
				<Button
					size="sm"
					aria-label="Send"
					disabled={!canSend}
					title={modelMissing ? 'Select a model first' : 'Send'}
					onclick={() => startChat(input)}
				>
					<ArrowUpIcon class="size-4" />
				</Button>
			</PromptInputActions>
		</PromptInput>
		{#if modelMissing}
			<p class="mt-2 text-sm text-muted-foreground">
				{hasModels
					? 'Select a model to start chatting.'
					: 'No models available. Ask an admin to configure one.'}
			</p>
		{/if}
	</div>
	<div class="flex max-w-2xl flex-wrap justify-center gap-2">
		{#each suggestions as suggestion (suggestion)}
			<PromptSuggestion onclick={() => startChat(suggestion)}>{suggestion}</PromptSuggestion>
		{/each}
	</div>
</div>
