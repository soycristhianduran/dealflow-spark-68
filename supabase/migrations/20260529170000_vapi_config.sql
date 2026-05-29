-- ============================================================
-- Vapi per-org config — BYOK (Bring Your Own Keys)
-- Each organization stores its own Vapi API key and phone
-- number ID so that calling is properly multi-tenant.
-- ============================================================

CREATE TABLE public.vapi_configs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_key          TEXT        NOT NULL,          -- Vapi secret key
  phone_number_id  TEXT        NOT NULL,          -- Vapi phone number UUID
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id)                        -- one config per org
);

ALTER TABLE public.vapi_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage vapi_configs"
  ON public.vapi_configs FOR ALL
  USING (organization_id IN (
    SELECT organization_id
    FROM   public.organization_members
    WHERE  user_id = auth.uid()
  ));
