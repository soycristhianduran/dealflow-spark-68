-- Per-slot booking capacity for the AI agent (e.g. 2 concurrent on peak hours)
alter table public.ai_agent_configs add column if not exists appointment_slot_capacity jsonb;
