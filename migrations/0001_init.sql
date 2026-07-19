-- 0001_init.sql
-- App tables. better-auth tables (user, session, account, verification) live in 0002.
-- FK references to user(id) resolve once 0002 is applied (SQLite validates FKs at DML time).

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'chat',            -- 'chat' | 'agent-run' | 'research'
  title TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'chat',            -- 'chat' | 'agent'
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
  deleted_at INTEGER
);
CREATE INDEX idx_conversations_user ON conversations(user_id, updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                            -- 'user' | 'assistant' | 'system'
  parts TEXT NOT NULL,                           -- JSON: UIMessage parts
  content_text TEXT NOT NULL DEFAULT '',         -- plain text of text parts, for FTS
  status TEXT NOT NULL DEFAULT 'complete',       -- 'complete' | 'partial' | 'failed'
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  mime TEXT NOT NULL,
  sha256 TEXT NOT NULL
);
CREATE INDEX idx_attachments_message ON attachments(message_id);

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES user(id) ON DELETE CASCADE,  -- NULL = built-in system agent
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL,
  provider_id TEXT,
  model_id TEXT,
  skill_names TEXT NOT NULL DEFAULT '[]',        -- JSON array
  tool_allowlist TEXT,                           -- JSON array, NULL = all registered
  trigger_type TEXT NOT NULL,                    -- 'persona' | 'schedule' | 'http' | 'manual'
  trigger_config TEXT NOT NULL DEFAULT '{}',     -- JSON { cron?: string }
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at INTEGER,
  next_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_agents_user ON agents(user_id);
CREATE INDEX idx_agents_schedule ON agents(trigger_type, enabled, next_run_at);

CREATE TABLE agent_runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  trigger TEXT NOT NULL,                         -- 'schedule' | 'http' | 'manual' | 'chat'
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'running',        -- 'running' | 'success' | 'failed'
  error TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE INDEX idx_agent_runs_agent ON agent_runs(agent_id, started_at DESC);
CREATE INDEX idx_agent_runs_status ON agent_runs(status) WHERE status = 'running';

CREATE TABLE memory_writes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT,
  agent_run_id TEXT,
  concept_path TEXT NOT NULL,
  action TEXT NOT NULL,                          -- 'create' | 'update' | 'delete'
  author TEXT NOT NULL,                          -- 'system' | 'user:<id>' | 'agent:<id>'
  diff TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_memory_writes_user ON memory_writes(user_id, created_at DESC);
CREATE INDEX idx_memory_writes_path ON memory_writes(concept_path, created_at DESC);

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  hash TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '["agents:run"]', -- JSON array
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);

CREATE TABLE providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,                            -- 'anthropic' | 'openai-compatible'
  base_url TEXT,
  api_key_enc TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  capabilities TEXT NOT NULL DEFAULT '["chat","streaming"]', -- JSON: chat|vision|tool_use|streaming
  enabled INTEGER NOT NULL DEFAULT 1,
  is_default_for TEXT,                           -- 'chat' | 'memory' | 'research' | NULL
  UNIQUE(provider_id, model_id)
);

CREATE TABLE mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  transport TEXT NOT NULL,                       -- 'stdio' | 'http' | 'sse'
  command TEXT,
  args TEXT NOT NULL DEFAULT '[]',               -- JSON array
  url TEXT,
  token_enc TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  scopes TEXT NOT NULL DEFAULT '["chat","agent"]', -- JSON: modes this server may be used in
  builtin INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL                            -- JSON
);

CREATE TABLE skill_invocations (
  id TEXT PRIMARY KEY,
  skill_name TEXT NOT NULL,
  scope TEXT NOT NULL,                           -- 'user' | 'shared'
  user_id TEXT NOT NULL,
  conversation_id TEXT,
  message_id TEXT,
  triggered_by TEXT NOT NULL,                    -- 'auto' | 'manual' | 'agent'
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_skill_invocations_skill ON skill_invocations(skill_name, created_at DESC);

-- FTS5: chat search. External content over messages(rowid), kept in sync by triggers.
CREATE VIRTUAL TABLE messages_fts USING fts5(
  conversation_id UNINDEXED,
  content_text,
  content='messages',
  content_rowid='rowid'
);
CREATE TRIGGER messages_fts_insert AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, conversation_id, content_text)
  VALUES (new.rowid, new.conversation_id, new.content_text);
END;
CREATE TRIGGER messages_fts_delete AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, conversation_id, content_text)
  VALUES ('delete', old.rowid, old.conversation_id, old.content_text);
END;
CREATE TRIGGER messages_fts_update AFTER UPDATE OF content_text ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, conversation_id, content_text)
  VALUES ('delete', old.rowid, old.conversation_id, old.content_text);
  INSERT INTO messages_fts(rowid, conversation_id, content_text)
  VALUES (new.rowid, new.conversation_id, new.content_text);
END;

-- FTS5: memory + documents. Source of truth is files on disk; synced by server code
-- (memory/fts.ts), not triggers. External-contentless so we can rebuild wholesale.
CREATE VIRTUAL TABLE memory_fts USING fts5(
  scope UNINDEXED,                               -- 'user:<id>' | 'shared'
  path UNINDEXED,
  title,
  description,
  tags,
  body
);
CREATE VIRTUAL TABLE documents_fts USING fts5(
  path UNINDEXED,
  content
);
