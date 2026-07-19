<script lang="ts">
	import * as Select from '$lib/components/ui/select/index.js';
	import type { ModelsByProvider } from '$lib/types.js';

	let {
		groups,
		value,
		onselect,
		disabled = false,
		placeholder = 'Select model'
	}: {
		groups: ModelsByProvider[];
		value: string;
		onselect: (value: string) => void;
		disabled?: boolean;
		placeholder?: string;
	} = $props();

	const label = $derived.by(() => {
		for (const group of groups) {
			for (const model of group.models) {
				if (`${model.providerId}/${model.modelId}` === value) {
					return `${model.displayName} (${group.provider.name})`;
				}
			}
		}
		if (value) return value.split('/').slice(1).join('/') || value;
		return placeholder;
	});
</script>

<Select.Root type="single" {value} onValueChange={onselect}>
	<Select.Trigger class="w-64" {disabled} title={label}>
		<span class="min-w-0 flex-1 truncate text-left">{label}</span>
	</Select.Trigger>
	<Select.Content>
		{#each groups as group (group.provider.id)}
			{#if group.models.length > 0}
				<Select.Group>
					<Select.Label>{group.provider.name}</Select.Label>
					{#each group.models as model (model.id)}
						<Select.Item value={`${model.providerId}/${model.modelId}`}>
							{model.displayName}
						</Select.Item>
					{/each}
				</Select.Group>
			{/if}
		{/each}
	</Select.Content>
</Select.Root>
