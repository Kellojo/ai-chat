import { config } from '../config.js';
import { createProvider, listProviders } from './repo/providers.js';
import type { Db } from './index.js';

export function seedBuiltinProviders(db: Db): void {
	if (listProviders(db).length > 0) return;
	createProvider(db, { name: 'Anthropic', type: 'anthropic', enabled: false });
	createProvider(db, {
		name: 'LM Studio',
		type: 'openai-compatible',
		baseUrl: config.LM_STUDIO_BASE_URL,
		enabled: false
	});
}
