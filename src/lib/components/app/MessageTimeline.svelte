<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Markdown } from '$lib/components/ai/markdown/index.js';
	import {
		Message,
		MessageActions,
		MessageContent
	} from '$lib/components/ai/message/index.js';
	import {
		Reasoning,
		ReasoningTrigger,
		ReasoningContent
	} from '$lib/components/ai/reasoning/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import FileIcon from '@lucide/svelte/icons/file';
	import type { UIMessage } from '$lib/types.js';

	let {
		messages,
		streaming = false,
		onregenerate,
		onedit
	}: {
		messages: UIMessage[];
		streaming?: boolean;
		onregenerate?: (messageId: string) => void;
		onedit?: (messageId: string, text: string) => void;
	} = $props();

	type Part = UIMessage['parts'][number];

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

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
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
					<Reasoning isStreaming={streaming && isLastAssistant(index) && partIndex === message.parts.length - 1}>
						<ReasoningTrigger>Reasoning</ReasoningTrigger>
						<ReasoningContent content={part.text} />
					</Reasoning>
				{:else if part.type === 'file'}
					{@const url = fileUrl(part)}
					{#if part.mediaType?.startsWith('image/')}
						<img src={url} alt="Attachment" class="max-h-64 rounded-md border" />
					{:else}
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic attachment URL from DB -->
						<a
							href={url}
							target="_blank"
							rel="noopener"
							class="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
						>
							<FileIcon class="size-4" />
							{(part as { filename?: string }).filename ?? 'Attachment'}
						</a>
					{/if}
				{:else if part.type.startsWith('tool-') || part.type === 'dynamic-tool'}
					<Badge variant="outline" class="font-mono text-xs">
						{part.type === 'dynamic-tool'
							? (part as { toolName?: string }).toolName
							: part.type.slice(5)}
					</Badge>
				{/if}
			{/each}

			<MessageActions class={message.role === 'user' ? 'justify-end' : ''}>
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
