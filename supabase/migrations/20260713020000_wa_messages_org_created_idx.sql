-- Acelera la carga de conversaciones (fetchConversations ordena por created_at
-- filtrando por org). Sin este índice compuesto había un sort sobre miles de
-- filas en cada mensaje nuevo → retraso al cargar la conversación.
CREATE INDEX IF NOT EXISTS idx_wa_messages_org_created ON public.whatsapp_messages(organization_id, created_at DESC);
