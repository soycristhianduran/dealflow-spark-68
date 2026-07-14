-- Horario de FUNCIONAMIENTO del agente de IA (independiente del horario de
-- agendamiento `working_hours`). Fuera de estas franjas el agente no responde
-- (silencio total) y el mensaje queda para atención humana. Se evalúa en la zona
-- horaria de la organización (organizations.timezone).
--
-- Shape de operating_hours (por día, lun..dom):
--   { "mon": {"enabled": true, "start": "08:00", "end": "20:00"}, ... }
alter table public.ai_agent_configs
  add column if not exists operating_hours_enabled boolean not null default false;
alter table public.ai_agent_configs
  add column if not exists operating_hours jsonb;
