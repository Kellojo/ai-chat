import { config } from '../config.js';
import type { Db } from '../db/index.js';
import { createAgent } from '../db/repo/agents.js';

export function seedBuiltinAgent(db: Db): void {
	const existing = db
		.prepare("SELECT id FROM agents WHERE name = 'memory-extraction' AND user_id IS NULL")
		.get();
	if (existing) return;
	createAgent(db, null, {
		name: 'memory-extraction',
		description: 'Extracts long-term memory from recent conversations (built-in).',
		systemPrompt:
			'You are the memory extraction agent. Review recent conversations and update the user memory bundle using the memory tools. Only persist durable facts, preferences and decisions.',
		triggerType: 'schedule',
		triggerConfig: { cron: config.MEMORY_EXTRACT_SCHEDULE },
		enabled: false
	});
}
