-- Metadatos locales de los WhatsApp Flows creados desde Klosify: qué claves de
-- datos dinámicos (${data.x}) espera cada Flow, para que el paso de envío
-- construya el payload de personalización desde el contacto.
CREATE TABLE IF NOT EXISTS public.org_whatsapp_flows (
  flow_id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL,
  name TEXT,
  data_keys JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.org_whatsapp_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_members_read_flows ON public.org_whatsapp_flows
  FOR SELECT USING (organization_id IN (SELECT get_my_organization_ids()));
