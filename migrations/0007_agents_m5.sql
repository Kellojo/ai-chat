-- 0007_agents_m5.sql
-- M5 agents: link conversations to the agent that produced them, and allow
-- per-agent step limits overriding AGENT_MAX_STEPS.

ALTER TABLE conversations ADD COLUMN agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE agents ADD COLUMN max_steps INTEGER;
