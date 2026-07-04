-- AI lead auto-qualification: the agent creates a lead when it detects
-- clear buying intent in the conversation (off by default per org).
alter table public.ai_agent_configs
  add column if not exists auto_qualify boolean not null default false;
