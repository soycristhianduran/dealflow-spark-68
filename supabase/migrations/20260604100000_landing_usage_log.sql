-- Token consumption log for IA Landings
-- Records every AI call (generation + refinement) with exact tokens used

CREATE TABLE IF NOT EXISTS public.ia_landings_usage_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  page_id         UUID        REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  call_type       TEXT        NOT NULL DEFAULT 'generation', -- 'generation' | 'refinement'
  tokens_input    INTEGER     NOT NULL DEFAULT 0,
  tokens_output   INTEGER     NOT NULL DEFAULT 0,
  tokens_total    INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ia_landings_usage_log_org_idx
  ON public.ia_landings_usage_log(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ia_landings_usage_log_page_idx
  ON public.ia_landings_usage_log(page_id);

ALTER TABLE public.ia_landings_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read_usage_log"
  ON public.ia_landings_usage_log FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );
