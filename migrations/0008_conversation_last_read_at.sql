-- 0008_conversation_last_read_at.sql
-- Server-side unread state: a chat is unread when it has an assistant message
-- newer than last_read_at (NULL means never marked read).

ALTER TABLE conversations ADD COLUMN last_read_at INTEGER;
