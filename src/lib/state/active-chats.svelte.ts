import { SvelteMap } from 'svelte/reactivity';
import type { Chat } from '@ai-sdk/svelte';
import type { UIMessage } from '$lib/types.js';

export const activeChats = new SvelteMap<string, Chat<UIMessage>>();
