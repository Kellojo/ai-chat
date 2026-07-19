-- 0005_user_settings.sql
-- Per-user preferences (theme, home-page suggestions, future user-scoped settings).

CREATE TABLE user_settings (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,                  -- JSON-encoded
  PRIMARY KEY (user_id, key)
);
