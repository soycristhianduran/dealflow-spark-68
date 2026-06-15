-- ─────────────────────────────────────────────────────────────────────────────
-- AI Agent billing: switch from per-conversation to per-CREDIT (consumption).
--
-- Unit: 1 credit = 1.000 tokens (input + output combined). The agent's real cost
-- is per-token, so a long conversation now consumes proportionally more credits.
-- We already measure real token spend (migration 20260615000000); this migration
-- turns that measurement into the billing meter.
--
--   plans.monthly_ai_agent_credits        — monthly credit quota (NULL = unlimited)
--   usage_counters.ai_agent_credits_used  — credits consumed this month
--   ia_agent_credits.credits_remaining    — REINTERPRETED as credits (1 = 1.000 tokens)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Plan monthly credit quota.
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS monthly_ai_agent_credits INTEGER;  -- NULL = unlimited

UPDATE public.plans SET monthly_ai_agent_credits = 500    WHERE id = 'starter';
UPDATE public.plans SET monthly_ai_agent_credits = 3000   WHERE id = 'pro';
UPDATE public.plans SET monthly_ai_agent_credits = 15000  WHERE id = 'business';
UPDATE public.plans SET monthly_ai_agent_credits = 60000  WHERE id = 'agency';

-- 2. Monthly usage counter for agent credits.
ALTER TABLE public.usage_counters
  ADD COLUMN IF NOT EXISTS ai_agent_credits_used BIGINT NOT NULL DEFAULT 0;

-- 3. Expose monthly_ai_agent_credits via get_active_subscription.
DROP FUNCTION IF EXISTS public.get_active_subscription(uuid);
CREATE OR REPLACE FUNCTION public.get_active_subscription(p_org_id uuid)
RETURNS TABLE (
  subscription_id                TEXT,
  plan_id                        TEXT,
  plan_name                      TEXT,
  status                         TEXT,
  trial_ends_at                  TIMESTAMPTZ,
  current_period_end             TIMESTAMPTZ,
  cancel_at_period_end           BOOLEAN,
  is_active                      BOOLEAN,
  max_users                      INTEGER,
  max_contacts                   INTEGER,
  max_active_deals               INTEGER,
  max_published_landings         INTEGER,
  max_automation_flows           INTEGER,
  monthly_automated_messages     INTEGER,
  monthly_ai_analyses            INTEGER,
  monthly_ai_objections          INTEGER,
  monthly_email_sends            INTEGER,
  monthly_ai_agent_conversations INTEGER,
  monthly_ai_agent_credits       INTEGER,
  feature_meta_ads               BOOLEAN,
  feature_email_campaigns        BOOLEAN,
  feature_api_access             BOOLEAN,
  feature_priority_support       BOOLEAN,
  feature_ig_automations         BOOLEAN,
  feature_ai_agent               BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    s.id::TEXT, p.id, p.name, s.status, s.trial_ends_at, s.current_period_end,
    s.cancel_at_period_end,
    (s.status IN ('trialing_internal','trialing','active')
     OR (s.status = 'trialing_internal' AND (s.trial_ends_at IS NULL OR s.trial_ends_at > NOW())))      AS is_active,
    p.max_users, p.max_contacts, p.max_active_deals, p.max_published_landings, p.max_automation_flows,
    p.monthly_automated_messages, p.monthly_ai_analyses, p.monthly_ai_objections, p.monthly_email_sends,
    p.monthly_ai_agent_conversations, p.monthly_ai_agent_credits,
    p.feature_meta_ads, p.feature_email_campaigns, p.feature_api_access, p.feature_priority_support,
    COALESCE(p.feature_ig_automations, false), COALESCE(p.feature_ai_agent, false)
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = p_org_id
  ORDER BY s.created_at DESC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_active_subscription(uuid) TO authenticated;

-- 4. Pre-check: upsert today's session (for analytics) + decide if the agent may
--    answer. Allowed when the plan has remaining monthly credits OR there are
--    add-on credit packs left. Does NOT deduct (we deduct the real tokens after).
CREATE OR REPLACE FUNCTION public.check_ai_agent_quota(
  p_org_id      UUID,
  p_channel     TEXT,
  p_session_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_today       DATE        := (NOW() AT TIME ZONE 'UTC')::DATE;
  v_month_start TIMESTAMPTZ := date_trunc('month', NOW() AT TIME ZONE 'UTC');
  v_session_id  UUID;
  v_limit       INTEGER;
  v_used        BIGINT := 0;
  v_packs       INTEGER := 0;
  v_allowed     BOOLEAN := true;
BEGIN
  INSERT INTO public.ai_agent_sessions
    (organization_id, channel, session_key, date_utc, message_count, last_message_at)
  VALUES (p_org_id, p_channel, p_session_key, v_today, 1, NOW())
  ON CONFLICT (organization_id, channel, session_key, date_utc)
  DO UPDATE SET message_count = ai_agent_sessions.message_count + 1, last_message_at = NOW()
  RETURNING id INTO v_session_id;

  SELECT p.monthly_ai_agent_credits INTO v_limit
  FROM   public.subscriptions s JOIN public.plans p ON p.id = s.plan_id
  WHERE  s.organization_id = p_org_id
    AND  s.status IN ('active','trialing','trialing_internal')
  ORDER  BY s.created_at DESC LIMIT 1;

  IF v_limit IS NOT NULL THEN
    SELECT COALESCE(ai_agent_credits_used, 0) INTO v_used
    FROM   public.usage_counters
    WHERE  organization_id = p_org_id AND period_start = v_month_start;

    IF v_used >= v_limit THEN
      SELECT COALESCE(SUM(credits_remaining), 0) INTO v_packs
      FROM   public.ia_agent_credits WHERE organization_id = p_org_id AND credits_remaining > 0;
      v_allowed := v_packs > 0;
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', v_allowed, 'session_id', v_session_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_ai_agent_quota(uuid, text, text) TO service_role;

-- 5. Record real usage AND deduct credits (1 credit = 1.000 tokens). Monthly
--    quota first; the portion above the plan limit is drawn from add-on packs
--    (oldest first). Called by the ai-agent edge function after each reply.
CREATE OR REPLACE FUNCTION public.record_ai_agent_usage(
  p_session_id    UUID,
  p_tokens_input  BIGINT,
  p_tokens_output BIGINT,
  p_calls         INTEGER DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id      UUID;
  v_month_start TIMESTAMPTZ := date_trunc('month', NOW() AT TIME ZONE 'UTC');
  v_month_end   TIMESTAMPTZ := v_month_start + INTERVAL '1 month';
  v_credits     INTEGER;
  v_limit       INTEGER;
  v_old_used    BIGINT := 0;
  v_overflow    INTEGER;
  v_take        INTEGER;
  v_pack        RECORD;
BEGIN
  IF p_session_id IS NULL THEN RETURN; END IF;

  -- Accumulate raw tokens on the session (analytics / cost report).
  UPDATE public.ai_agent_sessions
  SET    tokens_input  = tokens_input  + COALESCE(p_tokens_input, 0),
         tokens_output = tokens_output + COALESCE(p_tokens_output, 0),
         ai_calls      = ai_calls      + COALESCE(p_calls, 1)
  WHERE  id = p_session_id
  RETURNING organization_id INTO v_org_id;
  IF v_org_id IS NULL THEN RETURN; END IF;

  -- 1 credit per 1.000 tokens, minimum 1 for any real usage.
  v_credits := GREATEST(1, CEIL((COALESCE(p_tokens_input,0) + COALESCE(p_tokens_output,0)) / 1000.0))::INTEGER;

  -- Snapshot current monthly usage (to compute add-on overflow).
  SELECT COALESCE(ai_agent_credits_used, 0) INTO v_old_used
  FROM   public.usage_counters
  WHERE  organization_id = v_org_id AND period_start = v_month_start;

  -- Always track monthly consumption.
  INSERT INTO public.usage_counters (organization_id, period_start, period_end, ai_agent_credits_used)
  VALUES (v_org_id, v_month_start, v_month_end, v_credits)
  ON CONFLICT (organization_id, period_start)
  DO UPDATE SET ai_agent_credits_used = usage_counters.ai_agent_credits_used + v_credits,
               updated_at = NOW();

  -- Draw the over-quota portion from add-on packs.
  SELECT monthly_ai_agent_credits INTO v_limit
  FROM   public.subscriptions s JOIN public.plans p ON p.id = s.plan_id
  WHERE  s.organization_id = v_org_id
    AND  s.status IN ('active','trialing','trialing_internal')
  ORDER  BY s.created_at DESC LIMIT 1;

  IF v_limit IS NOT NULL THEN
    v_overflow := GREATEST(0, (v_old_used + v_credits) - GREATEST(v_old_used, v_limit))::INTEGER;
    FOR v_pack IN
      SELECT id, credits_remaining FROM public.ia_agent_credits
      WHERE organization_id = v_org_id AND credits_remaining > 0
      ORDER BY created_at ASC
    LOOP
      EXIT WHEN v_overflow <= 0;
      v_take := LEAST(v_overflow, v_pack.credits_remaining);
      UPDATE public.ia_agent_credits
      SET    credits_remaining = credits_remaining - v_take, updated_at = NOW()
      WHERE  id = v_pack.id;
      v_overflow := v_overflow - v_take;
    END LOOP;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_ai_agent_usage(uuid, bigint, bigint, integer) TO service_role;
