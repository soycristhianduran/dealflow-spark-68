-- Meta Conversions API (CAPI): cuando un lead se mueve a una etapa mapeada,
-- se envía el evento de conversión al píxel/dataset de Meta para que el
-- administrador de anuncios optimice con conversiones reales del CRM.

CREATE TABLE IF NOT EXISTS public.meta_conversion_settings (
  organization_id UUID PRIMARY KEY,
  pixel_id        TEXT,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.meta_conversion_mappings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  stage_id        UUID NOT NULL UNIQUE,
  event_name      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.meta_conversion_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  contact_id      UUID,
  stage_id        UUID,
  event_name      TEXT,
  status          TEXT NOT NULL DEFAULT 'sent', -- sent|error|skipped
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_conversion_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_conversion_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_conversion_logs     ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_members_manage_capi_settings ON public.meta_conversion_settings
  FOR ALL USING (organization_id IN (SELECT get_my_organization_ids()))
  WITH CHECK (organization_id IN (SELECT get_my_organization_ids()));

CREATE POLICY org_members_manage_capi_mappings ON public.meta_conversion_mappings
  FOR ALL USING (organization_id IN (SELECT get_my_organization_ids()))
  WITH CHECK (organization_id IN (SELECT get_my_organization_ids()));

CREATE POLICY org_members_read_capi_logs ON public.meta_conversion_logs
  FOR SELECT USING (organization_id IN (SELECT get_my_organization_ids()));

-- Al cambiar de etapa, si la etapa destino tiene evento mapeado, se notifica
-- (async, pg_net) a la función edge que envía el evento a Meta. El trigger no
-- bloquea ni falla la transacción del CRM: cualquier error queda en el log.
CREATE OR REPLACE FUNCTION public.notify_meta_conversion()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NEW.stage_id IS NOT NULL
     AND NEW.stage_id IS DISTINCT FROM OLD.stage_id
     AND EXISTS (SELECT 1 FROM public.meta_conversion_mappings m WHERE m.stage_id = NEW.stage_id) THEN
    PERFORM net.http_post(
      url     := 'https://oqwcgvemrvimrdrzjzil.supabase.co/functions/v1/meta-conversions',
      headers := '{"Content-Type":"application/json","x-conversion-key":"klosify-meta-capi-2026"}'::jsonb,
      body    := jsonb_build_object(
        'contact_id', NEW.id,
        'stage_id', NEW.stage_id,
        'organization_id', NEW.organization_id
      ),
      timeout_milliseconds := 10000
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca bloquear el movimiento del lead por un fallo de notificación.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_meta_conversion_trigger ON public.contacts;
CREATE TRIGGER notify_meta_conversion_trigger
  AFTER UPDATE OF stage_id ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_meta_conversion();
