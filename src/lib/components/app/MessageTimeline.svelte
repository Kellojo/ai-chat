<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { SvelteSet } from 'svelte/reactivity';
	import { formatDateTime, formatMessageTime } from '$lib/datetime.js';
	import { cn } from '$lib/utils.js';
	import type { TimeFormat } from '$lib/user-settings.js';
	import { Markdown } from '$lib/components/ai/markdown/index.js';
	import { Message, MessageActions, MessageContent } from '$lib/components/ai/message/index.js';
	import { ToolCallCard } from '$lib/components/ai/tool-call-card/index.js';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import FileIcon from '@lucide/svelte/icons/file';
	import BrainIcon from '@lucide/svelte/icons/brain';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import type { UIMessage } from '$lib/types.js';

	let {
		messages,
		streaming = false,
		timeFormat = 'auto',
		messageTimes,
		onregenerate,
		onedit,
		class: className
	}: {
		messages: UIMessage[];
		streaming?: boolean;
		timeFormat?: TimeFormat;
		messageTimes?: ReadonlyMap<string, number>;
		onregenerate?: (messageId: string) => void;
		onedit?: (messageId: string, text: string) => void;
		class?: string;
	} = $props();

	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});

	type Part = UIMessage['parts'][number];

	const openReasoning = new SvelteSet<string>();

	function toggleReasoning(key: string) {
		if (openReasoning.has(key)) openReasoning.delete(key);
		else openReasoning.add(key);
	}

	function messageText(message: UIMessage): string {
		return message.parts
			.filter((p): p is Part & { type: 'text' } => p.type === 'text')
			.map((p) => p.text)
			.join('');
	}

	function isLastAssistant(index: number): boolean {
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i].role === 'assistant') return i === index;
		}
		return false;
	}

	async function copyMessage(message: UIMessage) {
		try {
			await navigator.clipboard.writeText(messageText(message));
		} catch {
			toast.error('Failed to copy');
		}
	}

	function fileUrl(part: Part): string {
		return (part as { url?: string }).url ?? '';
	}
</script>

<div class={cn('mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6', className)}>
	{#each messages as message, index (message.id)}
		<Message class={message.role === 'user' ? 'flex-col items-end' : 'flex-col items-start'}>
			{#each message.parts as part, partIndex (partIndex)}
				{#if part.type === 'text'}
					{#if message.role === 'user'}
						<MessageContent class="max-w-[85%]">{part.text}</MessageContent>
					{:else}
						<Markdown class="w-full max-w-none" content={part.text} />
					{/if}
				{:else if part.type === 'reasoning'}
					{@const key = `${message.id}:${partIndex}`}
					{@const reasoningStreaming =
						streaming && isLastAssistant(index) && partIndex === message.parts.length - 1}
					{@const open = openReasoning.has(key)}
					<div class="w-full">
						<button
							type="button"
							class="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
							aria-expanded={open}
							onclick={() => toggleReasoning(key)}
						>
							{#if reasoningStreaming}
								<span class="reasoning-pulse flex"><BrainIcon class="size-4" /></span>
								<span>Reasoning…</span>
							{:else}
								<BrainIcon class="size-4" />
								<span>Reasoning</span>
							{/if}
							<ChevronDownIcon class="size-4 transition-transform {open ? 'rotate-180' : ''}" />
						</button>
						{#if open}
							<div class="reasoning-body mt-2 border-l-2 border-border pl-3">
								<Markdown
									class="w-full max-w-none text-sm text-muted-foreground"
									content={part.text}
								/>
							</div>
						{/if}
					</div>
				{:else if part.type === 'file'}
					{@const url = fileUrl(part)}
					{#if part.mediaType?.startsWith('image/')}
						<img src={url} alt="Attachment" class="max-h-64 rounded-md border" />
					{:else}
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a
							href={url}
							target="_blank"
							rel="noopener"
							class="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
						>
							<FileIcon class="size-4" />
							{(part as { filename?: string }).filename ?? 'Attachment'}
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{/if}
				{:else if part.type.startsWith('tool-') || part.type === 'dynamic-tool'}
					<ToolCallCard part={part as never} />
				{/if}
			{/each}

			<MessageActions class={message.role === 'user' ? 'justify-end' : ''}>
				{#if mounted}
					{@const ts = messageTimes?.get(message.id)}
					{#if ts}
						<span
							class="text-xs text-muted-foreground tabular-nums"
							title={formatDateTime(ts, timeFormat)}
						>
							{formatMessageTime(ts, timeFormat)}
						</span>
					{/if}
				{/if}
				<button
					title="Copy"
					aria-label="Copy message"
					class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
					onclick={() => copyMessage(message)}
				>
					<CopyIcon class="size-3.5" />
				</button>
				{#if message.role === 'user' && onedit}
					<button
						title="Edit"
						aria-label="Edit message"
						class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
						onclick={() => onedit(message.id, messageText(message))}
					>
						<PencilIcon class="size-3.5" />
					</button>
				{/if}
				{#if message.role === 'assistant' && isLastAssistant(index) && onregenerate && !streaming}
					<button
						title="Regenerate"
						aria-label="Regenerate response"
						class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
						onclick={() => onregenerate(message.id)}
					>
						<RefreshCwIcon class="size-3.5" />
					</button>
				{/if}
			</MessageActions>
		</Message>
	{/each}
</div>

<style>
	.reasoning-pulse {
		animation: reasoning-pulse 1.4s ease-in-out infinite;
	}

	@keyframes reasoning-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.35;
		}
	}

	:global(.reasoning-body ul),
	:global(.reasoning-body ol) {
		padding-left: 1.25rem;
		margin-top: 0.25em;
		margin-bottom: 0.25em;
	}

	:global(.reasoning-body li) {
		line-height: 1.6;
	}
</style>
