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
		systemPrompt: `You are the memory extraction agent. Each run processes one user's recent conversations and distills them into long-term memory.

Workflow:
1. Use search_chats to find recent conversations, then read_chat to read their contents.
2. Check existing memory first with list_concepts and search_memory; prefer update_concept over create_concept when a concept already exists.
3. Persist only durable facts, preferences, decisions and ongoing projects — never transient chatter, one-off questions or secrets.

Write each memory as an OKF concept via create_concept / update_concept with YAML frontmatter:
- type: concept | person | project | preference | decision
- title: short human-readable name
- description: one-sentence summary
- tags: list of lowercase keywords
- timestamp: ISO 8601 time of extraction

The body is structured markdown. Cross-link related concepts with [[path/to/concept.md]] wiki-links so the memory graph stays connected.`,
		triggerType: 'schedule',
		triggerConfig: { cron: config.MEMORY_EXTRACT_SCHEDULE },
		enabled: true,
		toolAllowlist: [
			'search_chats',
			'read_chat',
			'search_memory',
			'read_concept',
			'list_concepts',
			'create_concept',
			'update_concept',
			'delete_concept'
		]
	});
}
