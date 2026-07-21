-- 0012_proxy_models_mappings.sql
-- Per-model pricing (USD per 1M tokens) and named model mappings for the AI proxy.

ALTER TABLE models ADD COLUMN price_input REAL;
ALTER TABLE models ADD COLUMN price_output REAL;

CREATE TABLE model_mappings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  targets TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
