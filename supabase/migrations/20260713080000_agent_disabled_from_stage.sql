-- Apagar el agente de IA para leads que ya llegaron a cierta etapa "en adelante".
-- Cuando un lead alcanza la etapa referenciada (o cualquiera con `order` mayor),
-- el agente deja de responderle — lo maneja un humano/closer — aunque el agente
-- esté activo. Configurable por organización; NULL = sin efecto.
-- (Se activó inicialmente solo para BAJOXQBAJO apuntando a la etapa "Calientes".)
alter table public.ai_agent_configs
  add column if not exists agent_disabled_from_stage_id uuid
  references public.pipeline_stages(id) on delete set null;
