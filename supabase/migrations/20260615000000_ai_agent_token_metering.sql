-- ─────────────────────────────────────────────────────────────────────────────
-- AI Agent token metering
--
-- Until now the AI Agent's add-on was sold per "conversation" while its real
-- cost is per-TOKEN (heavy system prompt + tool definitions, multiplied by the
-- number of messages in a session). We were billing the most expensive add-on
-- blind. This migration records the actual Anthropic token spend per session so
-- we can compute the true cost per conversation and validate the pack pricing.
--
-- Model: claude-haiku-4-5  →  $1.00 / 1M input tokens, $5.00 / 1M output tokens.
-- (If the model changes, update ai_agent_token_cost_usd() accordingly.)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Per-session token totals (accumulated across the multi-turn tool loop and
--    across every message of the day, since a session = one calendar day).
ALTER TABLE public.ai_agent_sessions
  ADD COLUMN IF NOT EXISTS tokens_input  BIGINT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens_output BIGINT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_calls      INTEGER NOT NULL DEFAULT 0;

-- 2. Cost helper — single source of truth for Haiku 4.5 pricing.
CREATE OR REPLACE FUNCTION public.ai_agent_token_cost_usd(
  p_tokens_input  BIGINT,
  p_tokens_output BIGINT
)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ROUND(
    (COALESCE(p_tokens_input, 0)::NUMERIC  / 1000000) * 1.0   -- $1.00 / 1M input
  + (COALESCE(p_tokens_output, 0)::NUMERIC / 1000000) * 5.0,  -- $5.00 / 1M output
    6
  );
$$;

-- 3. Record usage for one agent reply (one or more Anthropic API calls).
--    Called by the ai-agent edge function after the tool-calling loop completes.
CREATE OR REPLACE FUNCTION public.record_ai_agent_usage(
  p_session_id    UUID,
  p_tokens_input  BIGINT,
  p_tokens_output BIGINT,
  p_calls         INTEGER DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_session_id IS NULL THEN RETURN; END IF;
  UPDATE public.ai_agent_sessions
  SET    tokens_input  = tokens_input  + COALESCE(p_tokens_input, 0),
         tokens_output = tokens_output + COALESCE(p_tokens_output, 0),
         ai_calls      = ai_calls      + COALESCE(p_calls, 1)
  WHERE  id = p_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ai_agent_token_cost_usd(bigint, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_ai_agent_usage(uuid, bigint, bigint, integer) TO service_role;

-- 4. Reporting view — true cost per conversation, per org per month.
--    Lets us answer: "are the $9/200 and $29/1000 packs profitable?"
CREATE OR REPLACE VIEW public.ai_agent_cost_report AS
SELECT
  s.organization_id,
  date_trunc('month', s.date_utc)::DATE                AS month,
  COUNT(*)                                             AS conversations,
  SUM(s.message_count)                                 AS messages,
  SUM(s.tokens_input)                                  AS tokens_input,
  SUM(s.tokens_output)                                 AS tokens_output,
  public.ai_agent_token_cost_usd(
    SUM(s.tokens_input)::BIGINT, SUM(s.tokens_output)::BIGINT
  )                                                    AS cost_usd,
  -- average real cost of a single conversation (the unit we sell)
  ROUND(
    public.ai_agent_token_cost_usd(
      SUM(s.tokens_input)::BIGINT, SUM(s.tokens_output)::BIGINT
    ) / NULLIF(COUNT(*), 0), 6
  )                                                    AS avg_cost_per_conversation
FROM public.ai_agent_sessions s
GROUP BY s.organization_id, date_trunc('month', s.date_utc);
