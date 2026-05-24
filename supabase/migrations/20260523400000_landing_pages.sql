-- ============================================================================
-- Landing Pages — constructor de landings con IA + drag & drop
-- ============================================================================

-- ── 1. Tabla principal ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.landing_pages (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID        REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL DEFAULT 'Nueva landing page',
  slug            TEXT        UNIQUE,        -- URL-friendly identifier
  html            TEXT,                       -- Final published HTML
  design          JSONB,                      -- Unlayer design JSON (drag & drop mode)
  prompt          TEXT,                       -- AI prompt used to generate the page
  mode            TEXT        DEFAULT 'ai' CHECK (mode IN ('ai', 'drag')),
  status          TEXT        DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  views           INTEGER     DEFAULT 0 NOT NULL,
  leads_count     INTEGER     DEFAULT 0 NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── 2. Index ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_landing_pages_org    ON public.landing_pages(organization_id);
CREATE INDEX IF NOT EXISTS idx_landing_pages_slug   ON public.landing_pages(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_landing_pages_status ON public.landing_pages(status);

-- ── 3. Auto-updated_at trigger ───────────────────────────────────────────────
CREATE TRIGGER touch_landing_pages_updated_at
  BEFORE UPDATE ON public.landing_pages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── 4. Auto-org_id trigger ───────────────────────────────────────────────────
CREATE TRIGGER set_landing_pages_org_id
  BEFORE INSERT ON public.landing_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id_on_insert();

-- ── 5. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_manage_landing_pages"
  ON public.landing_pages FOR ALL TO authenticated
  USING  (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ── 6. Public helper RPCs (SECURITY DEFINER — bypass RLS for anon callers) ──

-- Increment view counter (called by serve-landing edge function on each visit)
CREATE OR REPLACE FUNCTION public.inc_landing_page_views(p_page_id UUID)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.landing_pages SET views = views + 1 WHERE id = p_page_id;
$$;
GRANT EXECUTE ON FUNCTION public.inc_landing_page_views(UUID) TO anon, authenticated;
COMMENT ON FUNCTION public.inc_landing_page_views IS
  'Increments view counter for a landing page. Called by the public serve-landing edge function.';

-- Increment lead counter (called by landing-submit edge function on form submission)
CREATE OR REPLACE FUNCTION public.inc_landing_page_leads(p_page_id UUID)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.landing_pages SET leads_count = leads_count + 1 WHERE id = p_page_id;
$$;
GRANT EXECUTE ON FUNCTION public.inc_landing_page_leads(UUID) TO anon, authenticated;
COMMENT ON FUNCTION public.inc_landing_page_leads IS
  'Increments lead counter for a landing page. Called by the public landing-submit edge function.';

-- ── 7. Verify ────────────────────────────────────────────────────────────────
SELECT 'landing_pages table created' AS status,
       (SELECT COUNT(*) FROM public.landing_pages) AS existing_rows;
