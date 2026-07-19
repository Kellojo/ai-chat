<script lang="ts">
	import { setMode } from 'mode-watcher';
	import { toast } from 'svelte-sonner';
	import XIcon from '@lucide/svelte/icons/x';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import {
		MAX_GLOBAL_INSTRUCTIONS_LENGTH,
		MAX_SUGGESTIONS,
		THEMES,
		TIME_FORMATS,
		type Theme,
		type TimeFormat
	} from '$lib/user-settings.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const themeLabels: Record<Theme, string> = {
		light: 'Light',
		dark: 'Dark',
		system: 'System'
	};

	const timeFormatLabels: Record<TimeFormat, string> = {
		auto: 'Automatic',
		'12h': '12-hour',
		'24h': '24-hour'
	};

	let theme = $state<Theme>(data.settings.theme);
	let themeBusy = $state(false);

	let timeFormat = $state<TimeFormat>(data.settings.timeFormat);
	let timeFormatBusy = $state(false);

	let rows = $state(data.settings.suggestions.map((text) => ({ id: crypto.randomUUID(), text })));
	let suggestionsBusy = $state(false);

	let instructions = $state(data.settings.globalInstructions);
	let savedInstructions = $state(data.settings.globalInstructions);
	let instructionsBusy = $state(false);

	async function putSettings(body: {
		theme?: Theme;
		suggestions?: string[];
		globalInstructions?: string;
		timeFormat?: TimeFormat;
	}) {
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

	async function changeTimeFormat(value: TimeFormat) {
		if (timeFormatBusy || value === timeFormat) return;
		const previous = timeFormat;
		timeFormat = value;
		timeFormatBusy = true;
		try {
			await putSettings({ timeFormat: value });
		} catch (e) {
			timeFormat = previous;
			toast.error(e instanceof Error ? e.message : 'Failed to update time format');
		} finally {
			timeFormatBusy = false;
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

	async function saveInstructions() {
		if (instructionsBusy) return;
		const trimmed = instructions.trim();
		if (trimmed === savedInstructions) return;
		instructionsBusy = true;
		try {
			await putSettings({ globalInstructions: trimmed });
			savedInstructions = trimmed;
			toast.success(trimmed ? 'Instructions saved' : 'Instructions cleared');
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to save instructions');
		} finally {
			instructionsBusy = false;
		}
	}

	async function resetInstructions() {
		if (instructionsBusy || !savedInstructions) return;
		instructionsBusy = true;
		try {
			await putSettings({ globalInstructions: '' });
			instructions = '';
			savedInstructions = '';
			toast.success('Instructions cleared');
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to reset instructions');
		} finally {
			instructionsBusy = false;
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
		<Card.Content class="flex flex-col gap-4">
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
			<div class="flex items-center justify-between gap-6">
				<div class="flex min-w-0 flex-col gap-1">
					<Label>Time format</Label>
					<p class="text-sm text-muted-foreground">
						How times are shown. Automatic follows your browser locale.
					</p>
				</div>
				<Select.Root
					type="single"
					value={timeFormat}
					onValueChange={(value) => changeTimeFormat(value as TimeFormat)}
				>
					<Select.Trigger class="w-48 shrink-0" disabled={timeFormatBusy}>
						{timeFormatLabels[timeFormat]}
					</Select.Trigger>
					<Select.Content>
						{#each TIME_FORMATS as option (option)}
							<Select.Item value={option}>{timeFormatLabels[option]}</Select.Item>
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
			<Card.Title>Response instructions</Card.Title>
			<Card.Description>
				Tell the assistant how to respond (e.g. "never use emojis"). Applies to every chat, in
				addition to any per-conversation system prompt.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-2">
			<Textarea
				bind:value={instructions}
				rows={4}
				maxlength={MAX_GLOBAL_INSTRUCTIONS_LENGTH}
				placeholder="e.g. Answer concisely and never use emojis."
			/>
			<div class="flex items-center justify-between">
				<p class="text-xs text-muted-foreground">
					This is added to the system prompt of every chat. Leave empty for no global instructions.
				</p>
				<span class="shrink-0 text-xs text-muted-foreground"
					>{instructions.length}/{MAX_GLOBAL_INSTRUCTIONS_LENGTH}</span
				>
			</div>
			<div class="flex justify-end gap-2">
				<Button
					variant="outline"
					size="sm"
					onclick={resetInstructions}
					disabled={instructionsBusy || !savedInstructions}
				>
					Clear
				</Button>
				<Button
					size="sm"
					onclick={saveInstructions}
					disabled={instructionsBusy || instructions.trim() === savedInstructions}
				>
					{instructionsBusy ? 'Saving…' : 'Save instructions'}
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
