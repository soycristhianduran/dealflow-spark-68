-- Add niche column to organizations
-- Used to auto-create pipeline with industry-specific stages during onboarding.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS niche TEXT;

COMMENT ON COLUMN public.organizations.niche IS
  'Business niche selected during onboarding. Used to seed the default pipeline.';
