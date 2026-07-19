-- 0003_attachments_nullable_message.sql
-- Attachments are uploaded before the message that references them exists, so
-- message_id must be nullable (linked when the message is persisted).

CREATE TABLE attachments_new (
  id TEXT PRIMARY KEY,
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  mime TEXT NOT NULL,
  sha256 TEXT NOT NULL
);
INSERT INTO attachments_new (id, message_id, kind, path, mime, sha256)
  SELECT id, message_id, kind, path, mime, sha256 FROM attachments;
DROP TABLE attachments;
ALTER TABLE attachments_new RENAME TO attachments;
CREATE INDEX idx_attachments_message ON attachments(message_id);
