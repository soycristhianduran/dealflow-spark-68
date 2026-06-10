-- Custom sending domains per organization (multi-tenant email).
-- Each org can connect its own domain, verify DNS via Resend, and send
-- campaigns from it. Falls back to the shared sender when none is verified.

CREATE TABLE IF NOT EXISTS public.email_domains (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  domain            text NOT NULL,
  resend_domain_id  text,                       -- Resend's domain id
  status            text NOT NULL DEFAULT 'pending', -- pending | verified | failed | temporary_failure
  dns_records       jsonb NOT NULL DEFAULT '[]'::jsonb, -- records the user must add
  region            text NOT NULL DEFAULT 'us-east-1',
  is_default        boolean NOT NULL DEFAULT false,  -- preferred sending domain for the org
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  verified_at       timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_email_domains_org ON public.email_domains (organization_id);

ALTER TABLE public.email_domains ENABLE ROW LEVEL SECURITY;

-- Members of the org can read their org's domains.
DROP POLICY IF EXISTS "email_domains_select" ON public.email_domains;
CREATE POLICY "email_domains_select" ON public.email_domains
  FOR SELECT USING (public.is_org_member(organization_id));

-- Members can add/update/remove domains for their own org.
DROP POLICY IF EXISTS "email_domains_insert" ON public.email_domains;
CREATE POLICY "email_domains_insert" ON public.email_domains
  FOR INSERT WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "email_domains_update" ON public.email_domains;
CREATE POLICY "email_domains_update" ON public.email_domains
  FOR UPDATE USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "email_domains_delete" ON public.email_domains;
CREATE POLICY "email_domains_delete" ON public.email_domains
  FOR DELETE USING (public.is_org_member(organization_id));

-- Only one default domain per org.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_domains_one_default
  ON public.email_domains (organization_id) WHERE is_default;
