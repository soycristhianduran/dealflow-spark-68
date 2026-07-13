-- Carga completa de conversaciones de WhatsApp.
-- Antes la lista se armaba con los últimos 500 mensajes → solo ~278 de las 8.900
-- conversaciones aparecían. Ahora una RPC trae la ÚLTIMA de CADA número (todas),
-- con nombre de contacto, no leídos y el número al que el cliente escribió.
CREATE INDEX IF NOT EXISTS idx_wa_messages_org_phone_created
  ON public.whatsapp_messages(organization_id, phone_number, created_at DESC);

DROP FUNCTION IF EXISTS public.wa_conversations(uuid, int);
CREATE OR REPLACE FUNCTION public.wa_conversations(p_org uuid, p_limit int DEFAULT 1000)
RETURNS TABLE(phone_number text, contact_id uuid, contact_name text, last_message text, last_message_type text,
              last_direction text, last_message_time timestamptz, from_phone_number_id text, unread_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH last_msg AS (
    SELECT DISTINCT ON (phone_number)
      phone_number, contact_id, message_text, message_type, direction, created_at, from_phone_number_id
    FROM public.whatsapp_messages WHERE organization_id = p_org
    ORDER BY phone_number, created_at DESC
  ),
  last_incoming AS (
    SELECT DISTINCT ON (phone_number) phone_number, from_phone_number_id
    FROM public.whatsapp_messages
    WHERE organization_id = p_org AND direction='incoming' AND from_phone_number_id IS NOT NULL
    ORDER BY phone_number, created_at DESC
  ),
  unread AS (
    SELECT phone_number, count(*)::bigint c FROM public.whatsapp_messages
    WHERE organization_id = p_org AND direction='incoming' AND read_at IS NULL
    GROUP BY phone_number
  )
  SELECT lm.phone_number, lm.contact_id,
    nullif(trim(coalesce(ct.first_name,'')||' '||coalesce(ct.last_name,'')), '') AS contact_name,
    coalesce(nullif(lm.message_text,''), CASE WHEN lm.message_type <> 'text' THEN '['||lm.message_type||']' ELSE '' END),
    lm.message_type, lm.direction, lm.created_at,
    coalesce(li.from_phone_number_id, lm.from_phone_number_id),
    coalesce(u.c, 0)
  FROM last_msg lm
  LEFT JOIN last_incoming li ON li.phone_number = lm.phone_number
  LEFT JOIN unread u ON u.phone_number = lm.phone_number
  LEFT JOIN public.contacts ct ON ct.id = lm.contact_id
  ORDER BY lm.created_at DESC LIMIT p_limit;
$$;
