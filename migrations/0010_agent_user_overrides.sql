-- 0010_agent_user_overrides.sql
-- Per-user overrides for shared built-in agents (agents.user_id IS NULL),
-- starting with per-user enable/disable.

CREATE TABLE agent_user_overrides (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, agent_id)
);
