-- 0004_role_defaults.sql
-- Role defaults (which model serves chat/title/memory/research) move from a
-- column on models (one role per model max) to a dedicated table so the same
-- model can serve multiple roles.

CREATE TABLE _role_migration AS
  SELECT is_default_for AS role, id AS model_id FROM models WHERE is_default_for IS NOT NULL;

CREATE TABLE models_new (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  capabilities TEXT NOT NULL DEFAULT '["chat","streaming"]',
  enabled INTEGER NOT NULL DEFAULT 1,
  UNIQUE(provider_id, model_id)
);
INSERT INTO models_new (id, provider_id, model_id, display_name, capabilities, enabled)
  SELECT id, provider_id, model_id, display_name, capabilities, enabled FROM models;
DROP TABLE models;
ALTER TABLE models_new RENAME TO models;

CREATE TABLE role_defaults (
  role TEXT PRIMARY KEY,                    -- 'chat' | 'title' | 'memory' | 'research'
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE
);
INSERT INTO role_defaults (role, model_id) SELECT role, model_id FROM _role_migration;
DROP TABLE _role_migration;
