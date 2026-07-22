import type { ModelMapping, ModelMappingTarget } from './types.js';

export const MAPPING_PROVIDER_PREFIX = 'mapping:';

export interface ModelRef {
	providerId: string;
	modelId: string;
}

export function encodeModelRef(ref: ModelRef): string {
	return `${ref.providerId}/${ref.modelId}`;
}

export function decodeModelRef(value: string): ModelRef {
	const [providerId, ...rest] = value.split('/');
	return { providerId, modelId: rest.join('/') };
}

export function isMappingProviderId(providerId: string | null | undefined): boolean {
	return typeof providerId === 'string' && providerId.startsWith(MAPPING_PROVIDER_PREFIX);
}

export function mappingIdFromProviderId(providerId: string): string {
	return providerId.slice(MAPPING_PROVIDER_PREFIX.length);
}

export function mappingModelRef(mapping: ModelMapping): ModelRef {
	return { providerId: `${MAPPING_PROVIDER_PREFIX}${mapping.id}`, modelId: mapping.name };
}

export function isMappingRef(ref: ModelRef): boolean {
	return isMappingProviderId(ref.providerId);
}

export function mappingTargetRefs(mapping: ModelMapping): ModelMappingTarget[] {
	return mapping.targets;
}
