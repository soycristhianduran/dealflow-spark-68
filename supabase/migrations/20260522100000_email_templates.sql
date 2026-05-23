-- Email templates table for the drag-and-drop builder
CREATE TABLE IF NOT EXISTS public.email_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  subject     TEXT NOT NULL DEFAULT '',
  design      JSONB,          -- Unlayer editor design JSON (for re-editing)
  html        TEXT,           -- Exported HTML (for sending)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Auto-populate organization_id on insert
CREATE TRIGGER set_organization_id_trigger
  BEFORE INSERT ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id_on_insert('created_by');

-- All org members can read/write templates
CREATE POLICY "email_templates_org_select" ON public.email_templates
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

CREATE POLICY "email_templates_org_insert" ON public.email_templates
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "email_templates_org_update" ON public.email_templates
  FOR UPDATE TO authenticated
  USING  (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "email_templates_org_delete" ON public.email_templates
  FOR DELETE TO authenticated USING (public.is_org_member(organization_id));

-- Index
CREATE INDEX IF NOT EXISTS idx_email_templates_org ON public.email_templates(organization_id);
