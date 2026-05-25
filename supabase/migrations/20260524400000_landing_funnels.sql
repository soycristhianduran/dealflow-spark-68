-- ── landing_funnels ───────────────────────────────────────────────────────────
-- Groups multiple landing pages into a project/funnel (e.g. main → thank-you → upsell)

CREATE TABLE IF NOT EXISTS public.landing_funnels (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL DEFAULT 'Nuevo funnel',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_landing_funnels_org ON public.landing_funnels(organization_id);

-- Auto-set organization_id from the logged-in user's profile (same as landing_pages)
CREATE TRIGGER set_landing_funnels_org_id
  BEFORE INSERT ON public.landing_funnels
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id_on_insert();

-- RLS
ALTER TABLE public.landing_funnels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_manage_landing_funnels"
  ON public.landing_funnels
  FOR ALL
  USING  (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ── Extend landing_pages ──────────────────────────────────────────────────────
ALTER TABLE public.landing_pages
  ADD COLUMN IF NOT EXISTS funnel_id   uuid REFERENCES public.landing_funnels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS page_role   text NOT NULL DEFAULT 'main',   -- main | thankyou | upsell | other
  ADD COLUMN IF NOT EXISTS page_order  int  NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_landing_pages_funnel ON public.landing_pages(funnel_id);

-- ── Auto-migrate existing pages ───────────────────────────────────────────────
-- Create one default funnel per org and link all existing orphan pages to it.
-- Uses a CTE so each org gets exactly one funnel even if it has many pages.

WITH new_funnels AS (
  INSERT INTO public.landing_funnels (organization_id, name)
  SELECT DISTINCT organization_id, 'Mis landing pages'
  FROM   public.landing_pages
  WHERE  organization_id IS NOT NULL
  RETURNING id, organization_id
)
UPDATE public.landing_pages lp
SET    funnel_id = nf.id
FROM   new_funnels nf
WHERE  nf.organization_id = lp.organization_id
  AND  lp.funnel_id IS NULL;
