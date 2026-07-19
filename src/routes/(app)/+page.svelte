<script lang="ts">
	import { goto } from '$app/navigation';
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
	import { pendingMessage } from '$lib/state/pending-message.svelte.js';
	import type { Conversation } from '$lib/types.js';

	let input = $state('');
	let busy = $state(false);

	const suggestions = [
		'Explain a concept I keep forgetting',
		'Draft an email to my team',
		'Help me plan my week',
		'Brainstorm names for a project'
	];

	async function startChat(text: string) {
		const trimmed = text.trim();
		if (!trimmed || busy) return;
		busy = true;
		try {
			const res = await fetch('/api/conversations', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: '{}'
			});
			if (!res.ok) throw new Error('Failed to create conversation');
			const { conversation } = (await res.json()) as { conversation: Conversation };
			pendingMessage.set(trimmed);
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
			<PromptInputActions class="justify-end">
				<Button size="sm" aria-label="Send" disabled={busy || !input.trim()} onclick={() => startChat(input)}>
					<ArrowUpIcon class="size-4" />
				</Button>
			</PromptInputActions>
		</PromptInput>
	</div>
	<div class="flex max-w-2xl flex-wrap justify-center gap-2">
		{#each suggestions as suggestion (suggestion)}
			<PromptSuggestion onclick={() => startChat(suggestion)}>{suggestion}</PromptSuggestion>
		{/each}
	</div>
</div>
