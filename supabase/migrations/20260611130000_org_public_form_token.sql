ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS public_form_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_public_form_token ON public.organizations(public_form_token);
