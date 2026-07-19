<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { setMode } from 'mode-watcher';
	import { toast } from 'svelte-sonner';
	import XIcon from '@lucide/svelte/icons/x';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatDateTime } from '$lib/datetime.js';
	import type { ApiKey } from '$lib/types.js';
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

	let keyDialogOpen = $state(false);
	let keyLabel = $state('');
	let keyBusy = $state(false);
	let createdKey = $state<string | null>(null);
	let deleteKeyBusy = $state<string | null>(null);

	function openKeyDialog() {
		keyLabel = '';
		createdKey = null;
		keyDialogOpen = true;
	}

	function closeKeyDialog(open: boolean) {
		keyDialogOpen = open;
		if (!open && createdKey) {
			createdKey = null;
			invalidateAll();
		}
	}

	async function createKey(event: SubmitEvent) {
		event.preventDefault();
		if (keyBusy) return;
		keyBusy = true;
		try {
			const res = await fetch('/api/api-keys', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ label: keyLabel.trim() })
			});
			const payload = (await res.json().catch(() => null)) as {
				key?: ApiKey & { rawKey: string };
				message?: string;
			} | null;
			if (!res.ok || !payload?.key) {
				throw new Error(payload?.message ?? `Request failed (${res.status})`);
			}
			createdKey = payload.key.rawKey;
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to create API key');
		} finally {
			keyBusy = false;
		}
	}

	async function copyKey() {
		if (!createdKey) return;
		try {
			await navigator.clipboard.writeText(createdKey);
			toast.success('Copied');
		} catch {
			toast.error('Failed to copy');
		}
	}

	async function deleteKey(id: string) {
		if (deleteKeyBusy) return;
		deleteKeyBusy = id;
		try {
			const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE' });
			if (!res.ok) {
				const payload = (await res.json().catch(() => null)) as { message?: string } | null;
				throw new Error(payload?.message ?? `Request failed (${res.status})`);
			}
			toast.success('API key deleted');
			await invalidateAll();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to delete API key');
		} finally {
			deleteKeyBusy = null;
		}
	}

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

	<Card.Root id="api-keys">
		<Card.Header>
			<Card.Title>API keys</Card.Title>
			<Card.Description>
				Used to trigger agents over HTTP. Treat keys like passwords.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-3">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Label</Table.Head>
						<Table.Head>Created</Table.Head>
						<Table.Head>Last used</Table.Head>
						<Table.Head class="text-right">Actions</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.apiKeys as key (key.id)}
						<Table.Row>
							<Table.Cell class="max-w-48 truncate font-medium" title={key.label}>
								{key.label}
							</Table.Cell>
							<Table.Cell class="whitespace-nowrap text-muted-foreground">
								{formatDateTime(key.createdAt, data.settings.timeFormat)}
							</Table.Cell>
							<Table.Cell class="whitespace-nowrap text-muted-foreground">
								{key.lastUsedAt
									? formatDateTime(key.lastUsedAt, data.settings.timeFormat)
									: 'never'}
							</Table.Cell>
							<Table.Cell class="text-right">
								<Button
									variant="destructive"
									size="sm"
									disabled={deleteKeyBusy !== null}
									onclick={() => deleteKey(key.id)}
								>
									{deleteKeyBusy === key.id ? 'Deleting…' : 'Delete'}
								</Button>
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={4} class="text-center text-muted-foreground">
								No API keys yet.
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
			<div>
				<Button onclick={openKeyDialog}>Create API key</Button>
			</div>
		</Card.Content>
	</Card.Root>
</div>

<Dialog.Root open={keyDialogOpen} onOpenChange={closeKeyDialog}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Create API key</Dialog.Title>
		</Dialog.Header>
		{#if createdKey}
			<div class="flex flex-col gap-3">
				<p class="text-sm text-muted-foreground">Shown once — store it now.</p>
				<div class="flex items-center gap-2">
					<Input value={createdKey} readonly class="font-mono text-xs" />
					<Button variant="outline" size="sm" onclick={copyKey} aria-label="Copy API key">
						<CopyIcon class="size-4" />
					</Button>
				</div>
				<Dialog.Footer>
					<Button onclick={() => closeKeyDialog(false)}>Done</Button>
				</Dialog.Footer>
			</div>
		{:else}
			<form onsubmit={createKey} class="flex flex-col gap-4">
				<div class="flex flex-col gap-2">
					<Label for="api-key-label">Label</Label>
					<Input
						id="api-key-label"
						bind:value={keyLabel}
						maxlength={100}
						required
						placeholder="e.g. Nightly automation"
					/>
				</div>
				<Dialog.Footer>
					<Button type="submit" disabled={keyBusy || !keyLabel.trim()}>
						{keyBusy ? 'Creating…' : 'Create key'}
					</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
