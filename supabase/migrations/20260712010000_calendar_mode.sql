-- Modo de calendario del agente por organización.
--   'organization' = un calendario compartido + cupo por toda la org.
--   'individual' (o NULL) = calendario del asesor responsable del lead.
ALTER TABLE public.ai_agent_configs ADD COLUMN IF NOT EXISTS calendar_mode text;
