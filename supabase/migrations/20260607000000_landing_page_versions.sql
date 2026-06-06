-- ── landing_page_versions ─────────────────────────────────────────────────────
-- Stores the last 10 HTML snapshots per landing page for persistent undo/restore.
-- Equivalent to Lovable's version history — survives page reloads and browser closes.

CREATE TABLE IF NOT EXISTS public.landing_page_versions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id        UUID        NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  html           TEXT        NOT NULL,
  summary        TEXT,       -- what the AI changed (from CAMBIOS line)
  version_number INTEGER     NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lpv_page_created
  ON public.landing_page_versions(page_id, created_at DESC);

ALTER TABLE public.landing_page_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lpv_org_member_access"
  ON public.landing_page_versions
  USING (
    page_id IN (
      SELECT lp.id FROM public.landing_pages lp
      JOIN public.organization_members om ON om.organization_id = lp.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- Auto-assign version_number per page
CREATE OR REPLACE FUNCTION set_landing_version_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO NEW.version_number
  FROM public.landing_page_versions
  WHERE page_id = NEW.page_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_landing_version_number
  BEFORE INSERT ON public.landing_page_versions
  FOR EACH ROW EXECUTE FUNCTION set_landing_version_number();

-- Keep only last 10 versions per page (auto-prune older ones)
CREATE OR REPLACE FUNCTION prune_landing_versions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.landing_page_versions
  WHERE page_id = NEW.page_id
    AND id NOT IN (
      SELECT id FROM public.landing_page_versions
      WHERE page_id = NEW.page_id
      ORDER BY created_at DESC
      LIMIT 10
    );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prune_landing_versions
  AFTER INSERT ON public.landing_page_versions
  FOR EACH ROW EXECUTE FUNCTION prune_landing_versions();
