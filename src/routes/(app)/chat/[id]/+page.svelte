<script lang="ts">
	import ChatView from '$lib/components/app/ChatView.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

{#key data.conversation.id}
	<ChatView
		conversation={data.conversation}
		initialMessages={data.messages}
		groups={data.groups}
		defaultModel={data.defaultModel}
		timeFormat={data.timeFormat}
		personas={data.personas}
	/>
{/key}
