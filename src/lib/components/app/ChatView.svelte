<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Chat } from '@ai-sdk/svelte';
	import { DefaultChatTransport } from 'ai';
	import { untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { ChatContainer, ChatContainerContent } from '$lib/components/ai/chat-container/index.js';
	import {
		PromptInput,
		PromptInputTextarea,
		PromptInputActions
	} from '$lib/components/ai/prompt-input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import SquareIcon from '@lucide/svelte/icons/square';
	import PaperclipIcon from '@lucide/svelte/icons/paperclip';
	import XIcon from '@lucide/svelte/icons/x';
	import ChatTopbar from './ChatTopbar.svelte';
	import MessageTimeline from './MessageTimeline.svelte';
	import { pendingMessage } from '$lib/state/pending-message.svelte.js';
	import {
		chatMessageToUIMessage,
		type Agent,
		type ChatMessage,
		type Conversation,
		type ModelsByProvider
	} from '$lib/types.js';
	import type { TimeFormat } from '$lib/user-settings.js';

	let {
		conversation: initialConversation,
		initialMessages,
		groups,
		defaultModel,
		timeFormat = 'auto',
		personas
	}: {
		conversation: Conversation;
		initialMessages: ChatMessage[];
		groups: ModelsByProvider[];
		defaultModel?: { providerId: string; modelId: string } | null;
		timeFormat?: TimeFormat;
		personas?: Agent[];
	} = $props();

	// svelte-ignore state_referenced_locally
	let conversation = $state(initialConversation);
	let input = $state('');
	let selectedFiles = $state<File[]>([]);
	let fileInput: HTMLInputElement | undefined = $state();

	const chat = new Chat({
		id: untrack(() => conversation.id),
		messages: untrack(() => initialMessages.map(chatMessageToUIMessage)),
		transport: new DefaultChatTransport({
			api: '/api/chat',
			prepareSendMessagesRequest: ({ messages }) => ({
				body: { conversationId: conversation.id, messages }
			})
		}),
		onError: (error) => {
			toast.error(error.message || 'Something went wrong');
		}
	});

	let prevStatus = $state<string>(chat.status);

	// svelte-ignore state_referenced_locally
	const messageTimes = new SvelteMap<string, number>(
		initialMessages.map((m) => [m.id, m.createdAt])
	);

	const streaming = $derived(chat.status === 'streaming' || chat.status === 'submitted');
	const waiting = $derived(chat.status === 'submitted');
	const canSend = $derived((input.trim().length > 0 || selectedFiles.length > 0) && !streaming);

	$effect(() => {
		const pending = pendingMessage.consume();
		if (pending) send(pending);
	});

	$effect(() => {
		for (const m of chat.messages) {
			if (!messageTimes.has(m.id)) messageTimes.set(m.id, Date.now());
		}
	});

	$effect(() => {
		const current = chat.status;
		if (prevStatus !== 'ready' && current === 'ready') {
			invalidateAll();
		}
		prevStatus = current;
	});

	async function uploadFiles(): Promise<
		{ type: 'file'; url: string; mediaType: string; filename: string }[]
	> {
		const parts = [];
		for (const file of selectedFiles) {
			const form = new FormData();
			form.append('file', file);
			const res = await fetch(`/api/conversations/${conversation.id}/attachments`, {
				method: 'POST',
				body: form
			});
			if (!res.ok) {
				const data = await res.json().catch(() => null);
				throw new Error(data?.message ?? `Failed to upload ${file.name}`);
			}
			const { attachment } = await res.json();
			parts.push({
				type: 'file' as const,
				url: `/api/conversations/${conversation.id}/attachments/${attachment.id}`,
				mediaType: attachment.mime,
				filename: attachment.name
			});
		}
		return parts;
	}

	async function send(text: string) {
		const trimmed = text.trim();
		if ((!trimmed && selectedFiles.length === 0) || streaming) return;
		try {
			if (selectedFiles.length > 0) {
				const fileParts = await uploadFiles();
				selectedFiles = [];
				chat.sendMessage({
					parts: [...(trimmed ? [{ type: 'text' as const, text: trimmed }] : []), ...fileParts]
				});
			} else {
				chat.sendMessage({ text: trimmed });
			}
			input = '';
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to send message');
		}
	}

	async function stop() {
		fetch(`/api/chat/${conversation.id}/abort`, { method: 'POST' }).catch(() => undefined);
		await chat.stop();
	}

	function regenerate(messageId: string) {
		chat.regenerate({ messageId });
	}

	function startEdit(messageId: string, text: string) {
		const index = chat.messages.findIndex((m) => m.id === messageId);
		if (index === -1) return;
		chat.messages = chat.messages.slice(0, index);
		input = text;
	}

	function pickFiles() {
		fileInput?.click();
	}

	function filesChosen(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		selectedFiles = [...selectedFiles, ...Array.from(target.files ?? [])];
		target.value = '';
	}
</script>

<ChatTopbar
	{conversation}
	{groups}
	{defaultModel}
	{personas}
	onupdated={(updated) => (conversation = updated)}
/>

<ChatContainer class="min-h-0 flex-1">
	<ChatContainerContent>
		<MessageTimeline
			messages={chat.messages}
			{streaming}
			{timeFormat}
			{messageTimes}
			onregenerate={regenerate}
			onedit={startEdit}
		/>
		{#if waiting}
			<div class="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 pb-4 text-muted-foreground">
				<span class="thinking-dots" aria-hidden="true">
					<span class="thinking-dot"></span>
					<span class="thinking-dot"></span>
					<span class="thinking-dot"></span>
				</span>
				<span class="text-sm">Thinking…</span>
			</div>
		{/if}
	</ChatContainerContent>
</ChatContainer>

<div class="mx-auto w-full max-w-3xl px-4 pb-4">
	{#if selectedFiles.length > 0}
		<div class="mb-2 flex flex-wrap gap-2">
			{#each selectedFiles as file, i (file.name + i)}
				<Badge variant="secondary" class="flex items-center gap-1">
					{file.name}
					<button
						aria-label="Remove {file.name}"
						onclick={() => (selectedFiles = selectedFiles.filter((_, j) => j !== i))}
					>
						<XIcon class="size-3" />
					</button>
				</Badge>
			{/each}
		</div>
	{/if}
	<PromptInput
		value={input}
		onValueChange={(v) => (input = v)}
		isLoading={streaming}
		onSubmit={() => send(input)}
	>
		<PromptInputTextarea placeholder="Ask anything…" />
		<PromptInputActions class="justify-between">
			<Button variant="ghost" size="icon" aria-label="Attach files" onclick={pickFiles}>
				<PaperclipIcon class="size-4" />
			</Button>
			{#if streaming}
				<Button size="sm" variant="destructive" aria-label="Stop" onclick={stop}>
					<SquareIcon class="size-4" />
				</Button>
			{:else}
				<Button size="sm" disabled={!canSend} aria-label="Send" onclick={() => send(input)}>
					<ArrowUpIcon class="size-4" />
				</Button>
			{/if}
		</PromptInputActions>
	</PromptInput>
	<input bind:this={fileInput} type="file" multiple class="hidden" onchange={filesChosen} />
</div>

<style>
	.thinking-dots {
		display: inline-flex;
		align-items: center;
		gap: 3px;
	}

	.thinking-dot {
		width: 5px;
		height: 5px;
		border-radius: 9999px;
		background-color: currentColor;
		animation: thinking-bounce 1.2s ease-in-out infinite;
	}

	.thinking-dot:nth-child(2) {
		animation-delay: 0.15s;
	}

	.thinking-dot:nth-child(3) {
		animation-delay: 0.3s;
	}

	@keyframes thinking-bounce {
		0%,
		100% {
			transform: translateY(0);
			opacity: 0.4;
		}
		50% {
			transform: translateY(-3px);
			opacity: 1;
		}
	}
</style>
