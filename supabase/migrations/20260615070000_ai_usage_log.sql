-- ─────────────────────────────────────────────────────────────────────────────
-- Unified AI usage log — exact token spend for the features that were estimated
-- (analyses, objections, assistant, call-analyzer). Agent + Landings already log
-- their tokens elsewhere; this closes the gap so the platform monitor shows the
-- REAL Anthropic cost per feature/org instead of per-unit estimates.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id              BIGSERIAL   PRIMARY KEY,
  organization_id UUID        REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature         TEXT        NOT NULL,           -- 'analysis' | 'assistant' | 'call' | ...
  model           TEXT,
  tokens_input    BIGINT      NOT NULL DEFAULT 0,
  tokens_output   BIGINT      NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_usage_log_org_month_idx
  ON public.ai_usage_log (organization_id, created_at);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;
-- No client read policy: this is platform-internal (service role / platform monitor only).

-- Fire-and-forget logger called by the AI edge functions.
CREATE OR REPLACE FUNCTION public.log_ai_usage(
  p_org_id  UUID,
  p_feature TEXT,
  p_in      BIGINT,
  p_out     BIGINT,
  p_model   TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  INSERT INTO public.ai_usage_log (organization_id, feature, model, tokens_input, tokens_output)
  VALUES (p_org_id, p_feature, p_model, COALESCE(p_in,0), COALESCE(p_out,0));
$$;
GRANT EXECUTE ON FUNCTION public.log_ai_usage(uuid, text, bigint, bigint, text) TO service_role;

-- Cost per feature for the platform monitor, priced by the ACTUAL model:
-- analyses + assistant run on OpenAI gpt-4o-mini ($0.15/$0.60); agent/landings/
-- call run on Anthropic (Haiku $1/$5, Sonnet $3/$15).
CREATE OR REPLACE FUNCTION public.ai_usage_cost_report()
RETURNS TABLE (organization_id UUID, feature TEXT, tokens_input BIGINT, tokens_output BIGINT, cost_usd NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT organization_id, feature,
         SUM(tokens_input)::BIGINT, SUM(tokens_output)::BIGINT,
         ROUND(SUM(
           CASE WHEN model LIKE 'gpt-4o-mini%'
                THEN tokens_input::NUMERIC/1e6*0.15 + tokens_output::NUMERIC/1e6*0.60
                WHEN model LIKE 'claude-sonnet%'
                THEN tokens_input::NUMERIC/1e6*3    + tokens_output::NUMERIC/1e6*15
                ELSE tokens_input::NUMERIC/1e6*1    + tokens_output::NUMERIC/1e6*5  -- Haiku
           END), 4)
  FROM public.ai_usage_log
  WHERE created_at >= date_trunc('month', NOW() AT TIME ZONE 'UTC')
  GROUP BY organization_id, feature;
$$;
GRANT EXECUTE ON FUNCTION public.ai_usage_cost_report() TO service_role;
