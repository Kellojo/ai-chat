-- 0016_conversations_agent_default.sql
-- Agent mode (tool use with a higher step budget) is now the default for new
-- conversations. SQLite cannot alter a column default in place, so rebuild.

CREATE TABLE conversations_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'chat',            -- 'chat' | 'agent-run' | 'research'
  title TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'agent',           -- 'chat' | 'agent'
  provider_id TEXT,
  model_id TEXT,
  system_prompt TEXT,
  memory_enabled INTEGER NOT NULL DEFAULT 1,
  max_steps INTEGER,
  temperature REAL,
  max_tokens INTEGER,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  last_read_at INTEGER,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL
);
INSERT INTO conversations_new (
  id, user_id, kind, title, mode, provider_id, model_id, system_prompt,
  memory_enabled, max_steps, temperature, max_tokens, pinned,
  created_at, updated_at, deleted_at, last_read_at, agent_id
)
  SELECT
    id, user_id, kind, title, mode, provider_id, model_id, system_prompt,
    memory_enabled, max_steps, temperature, max_tokens, pinned,
    created_at, updated_at, deleted_at, last_read_at, agent_id
  FROM conversations;
DROP TABLE conversations;
ALTER TABLE conversations_new RENAME TO conversations;
CREATE INDEX idx_conversations_user ON conversations(user_id, updated_at DESC) WHERE deleted_at IS NULL;
