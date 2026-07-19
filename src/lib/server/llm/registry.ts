import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { decryptSecret } from '../crypto.js';
import { getDb } from '../db/index.js';
import {
	findModel,
	findRoleModel,
	listEnabledModels,
	toPublic as modelToPublic,
	type ChatModel,
	type ModelRole
} from '../db/repo/models.js';
import {
	getProvider,
	listProviders,
	toPublic as providerToPublic,
	type Provider,
	type ProviderRow
} from '../db/repo/providers.js';

type LanguageModelFactory = (modelId: string) => LanguageModel;

const cache = new Map<string, { signature: string; factory: LanguageModelFactory }>();

function buildFactory(provider: ProviderRow): LanguageModelFactory {
	const apiKey = provider.api_key_enc ? decryptSecret(provider.api_key_enc) : undefined;
	if (provider.type === 'anthropic') {
		const p = createAnthropic({ apiKey, baseURL: provider.base_url ?? undefined });
		return (modelId) => p(modelId);
	}
	if (!provider.base_url) {
		throw new Error(`Provider "${provider.name}" is missing a base URL`);
	}
	const p = createOpenAICompatible({
		name: provider.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
		apiKey,
		baseURL: provider.base_url
	});
	return (modelId) => p(modelId);
}

function factoryFor(provider: ProviderRow): LanguageModelFactory {
	const signature = [provider.type, provider.name, provider.base_url, provider.api_key_enc].join(
		'|'
	);
	const hit = cache.get(provider.id);
	if (hit && hit.signature === signature) return hit.factory;
	const factory = buildFactory(provider);
	cache.set(provider.id, { signature, factory });
	return factory;
}

export function invalidateProviderCache(providerId: string): void {
	cache.delete(providerId);
}

export class ModelUnavailableError extends Error {}

export function resolveModel(ref: { providerId: string; modelId: string }): LanguageModel {
	const db = getDb();
	const provider = getProvider(db, ref.providerId);
	if (!provider || provider.enabled !== 1) {
		throw new ModelUnavailableError(`Provider ${ref.providerId} is not available`);
	}
	const model = findModel(db, ref.providerId, ref.modelId);
	if (!model || model.enabled !== 1) {
		throw new ModelUnavailableError(`Model ${ref.modelId} is not available`);
	}
	return factoryFor(provider)(ref.modelId);
}

export function roleModel(role: ModelRole): LanguageModel {
	const db = getDb();
	const model = findRoleModel(db, role);
	if (!model) {
		throw new ModelUnavailableError(`No enabled default model configured for role "${role}"`);
	}
	return resolveModel({ providerId: model.provider_id, modelId: model.model_id });
}

export interface ModelsByProvider {
	provider: Provider;
	models: ChatModel[];
}

export function listModelsGrouped(): ModelsByProvider[] {
	const db = getDb();
	const providers = listProviders(db).filter((p) => p.enabled === 1);
	const models = listEnabledModels(db);
	return providers
		.map((p) => ({
			provider: providerToPublic(p),
			models: models.filter((m) => m.provider_id === p.id).map(modelToPublic)
		}))
		.filter((g) => g.models.length > 0);
}

async function fetchAnthropicModels(
	provider: ProviderRow,
	apiKey: string | undefined
): Promise<string[]> {
	if (!apiKey) throw new Error(`Provider "${provider.name}" requires an API key to list models`);
	const base = provider.base_url ?? 'https://api.anthropic.com';
	const res = await fetch(`${base}/v1/models?limit=1000`, {
		headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
	});
	if (!res.ok) throw new Error(`Anthropic /models probe failed: ${res.status} ${await res.text()}`);
	const body = (await res.json()) as { data?: { id: string }[] };
	return (body.data ?? []).map((m) => m.id);
}

async function fetchOpenAICompatibleModels(
	provider: ProviderRow,
	apiKey: string | undefined
): Promise<string[]> {
	if (!provider.base_url) throw new Error(`Provider "${provider.name}" is missing a base URL`);
	const headers: Record<string, string> = {};
	if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
	const res = await fetch(`${provider.base_url.replace(/\/$/, '')}/models`, { headers });
	if (!res.ok) throw new Error(`Provider /models probe failed: ${res.status} ${await res.text()}`);
	const body = (await res.json()) as { data?: { id: string }[] };
	return (body.data ?? []).map((m) => m.id);
}

export function fetchProviderModels(providerId: string): Promise<string[]> {
	const db = getDb();
	const provider = getProvider(db, providerId);
	if (!provider) throw new ModelUnavailableError(`Provider ${providerId} not found`);
	const apiKey = provider.api_key_enc ? decryptSecret(provider.api_key_enc) : undefined;
	return provider.type === 'anthropic'
		? fetchAnthropicModels(provider, apiKey)
		: fetchOpenAICompatibleModels(provider, apiKey);
}
