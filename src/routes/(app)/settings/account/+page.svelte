<script lang="ts">
	import { setMode } from 'mode-watcher';
	import { toast } from 'svelte-sonner';
	import XIcon from '@lucide/svelte/icons/x';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { MAX_SUGGESTIONS, THEMES, type Theme } from '$lib/user-settings.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const themeLabels: Record<Theme, string> = {
		light: 'Light',
		dark: 'Dark',
		system: 'System'
	};

	let theme = $state<Theme>(data.settings.theme);
	let themeBusy = $state(false);

	let rows = $state(data.settings.suggestions.map((text) => ({ id: crypto.randomUUID(), text })));
	let suggestionsBusy = $state(false);

	async function putSettings(body: { theme?: Theme; suggestions?: string[] }) {
		const res = await fetch('/api/user/settings', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) {
			const payload = (await res.json().catch(() => null)) as { message?: string } | null;
			throw new Error(payload?.message ?? `Request failed (${res.status})`);
		}
	}

	async function changeTheme(value: Theme) {
		if (themeBusy || value === theme) return;
		const previous = theme;
		theme = value;
		setMode(value);
		themeBusy = true;
		try {
			await putSettings({ theme: value });
		} catch (e) {
			theme = previous;
			setMode(previous);
			toast.error(e instanceof Error ? e.message : 'Failed to update theme');
		} finally {
			themeBusy = false;
		}
	}

	function addRow() {
		if (rows.length >= MAX_SUGGESTIONS) return;
		rows = [...rows, { id: crypto.randomUUID(), text: '' }];
	}

	function removeRow(id: string) {
		rows = rows.filter((row) => row.id !== id);
	}

	async function saveSuggestions() {
		if (suggestionsBusy) return;
		const cleaned = rows.map((row) => row.text.trim()).filter((text) => text.length > 0);
		suggestionsBusy = true;
		try {
			await putSettings({ suggestions: cleaned });
			rows = cleaned.map((text) => ({ id: crypto.randomUUID(), text }));
			toast.success('Suggestions saved');
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to save suggestions');
		} finally {
			suggestionsBusy = false;
		}
	}
</script>

<div class="flex flex-col gap-4">
	<h2 class="text-xl font-semibold">Account</h2>
	<p class="text-sm text-muted-foreground">Personal preferences for your account.</p>

	<Card.Root>
		<Card.Header>
			<Card.Title>Appearance</Card.Title>
			<Card.Description>Choose how the app looks.</Card.Description>
		</Card.Header>
		<Card.Content>
			<div class="flex items-center justify-between gap-6">
				<div class="flex min-w-0 flex-col gap-1">
					<Label>Theme</Label>
					<p class="text-sm text-muted-foreground">Light, dark, or follow your system setting.</p>
				</div>
				<Select.Root
					type="single"
					value={theme}
					onValueChange={(value) => changeTheme(value as Theme)}
				>
					<Select.Trigger class="w-48 shrink-0" disabled={themeBusy}>
						{themeLabels[theme]}
					</Select.Trigger>
					<Select.Content>
						{#each THEMES as option (option)}
							<Select.Item value={option}>{themeLabels[option]}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Chat suggestions</Card.Title>
			<Card.Description>
				Shown as quick-start chips on the home page. Up to {MAX_SUGGESTIONS} suggestions.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-3">
			{#each rows as row (row.id)}
				<div class="flex items-center gap-2">
					<Input bind:value={row.text} maxlength={200} placeholder="Suggestion text" />
					<Button
						variant="ghost"
						size="sm"
						onclick={() => removeRow(row.id)}
						aria-label="Remove suggestion"
					>
						<XIcon class="size-4" />
					</Button>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">No suggestions yet. Add one below.</p>
			{/each}
			<div class="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					onclick={addRow}
					disabled={rows.length >= MAX_SUGGESTIONS}
				>
					Add suggestion
				</Button>
				<Button size="sm" onclick={saveSuggestions} disabled={suggestionsBusy}>
					{suggestionsBusy ? 'Saving…' : 'Save suggestions'}
				</Button>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>API keys</Card.Title>
			<Card.Description>
				API keys for programmatic access will be manageable here in a future update.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Button disabled>Create API key</Button>
		</Card.Content>
	</Card.Root>
</div>
