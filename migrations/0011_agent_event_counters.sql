-- 0011_agent_event_counters.sql
-- Per-user occurrence counters for event-triggered agents, used to run an
-- agent only on every Nth occurrence of its event.

CREATE TABLE agent_event_counters (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (agent_id, user_id, event)
);
