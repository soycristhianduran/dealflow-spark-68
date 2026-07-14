-- Garantía de "número primario": toda organización con números de WhatsApp
-- activos debe tener exactamente uno marcado como primario (el remitente por
-- defecto). La columna is_primary tiene default false y algunos flujos no lo
-- fijaban, dejando orgs sin primario. Backfill: marca el número activo más
-- reciente como primario en las orgs que no tengan ninguno. Idempotente.
WITH need AS (
  SELECT organization_id
  FROM public.whatsapp_configs
  WHERE is_active
  GROUP BY organization_id
  HAVING COUNT(*) FILTER (WHERE is_primary) = 0
),
pick AS (
  SELECT DISTINCT ON (c.organization_id) c.id
  FROM public.whatsapp_configs c
  JOIN need n ON n.organization_id = c.organization_id
  WHERE c.is_active
  ORDER BY c.organization_id, c.created_at DESC
)
UPDATE public.whatsapp_configs SET is_primary = true WHERE id IN (SELECT id FROM pick);
