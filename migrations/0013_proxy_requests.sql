-- 0013_proxy_requests.sql
-- Request log for the OpenAI-compatible AI proxy. Metadata only; request and
-- response bodies are never stored.

CREATE TABLE proxy_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  api_key_id TEXT,
  endpoint TEXT NOT NULL,
  requested_model TEXT NOT NULL,
  mapping_id TEXT,
  provider_id TEXT,
  model_id TEXT,
  fallback_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  http_status INTEGER,
  started_at INTEGER NOT NULL,
  latency_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,
  stream INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  compression TEXT
);

CREATE INDEX idx_proxy_requests_started_at ON proxy_requests (started_at DESC);
CREATE INDEX idx_proxy_requests_user_id ON proxy_requests (user_id);
CREATE INDEX idx_proxy_requests_api_key_id ON proxy_requests (api_key_id);
