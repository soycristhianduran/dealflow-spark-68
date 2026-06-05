-- ============================================================================
-- Fix trial expiry enforcement
-- ============================================================================
-- Two bugs:
--
-- 1. get_active_subscription returns is_active=TRUE for trialing_internal
--    subscriptions even AFTER trial_ends_at has passed. Frontend correctly
--    calculates `locked` client-side, but any server-side code (consume_ai_credit,
--    edge functions) that trusts is_active would still allow access.
--
-- 2. consume_ai_credit allows AI usage for orgs whose trial has expired
--    (it only checks `status IN (...)`, not trial_ends_at).
--
-- Fix: make "is the trial still valid?" a single expression used in both
-- places. An expired trialing_internal subscription is treated as inactive.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: is_subscription_active(status, trial_ends_at)
-- ─────────────────────────────────────────────────────────────────────────────
-- Single source of truth for "can this org use the app right now?".
-- Used in get_active_subscription and consume_ai_credit.
CREATE OR REPLACE FUNCTION public.is_subscription_active(
  p_status       TEXT,
  p_trial_ends_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      -- Stripe-managed active/trialing → always active (Stripe handles expiry)
      WHEN p_status IN ('active', 'trialing') THEN TRUE
      -- Internal trial → active only if NOT yet expired
      WHEN p_status = 'trialing_internal' THEN
        (p_trial_ends_at IS NULL OR p_trial_ends_at > NOW())
      -- Everything else (canceled, unpaid, past_due, etc.) → not active
      ELSE FALSE
    END;
$$;

GRANT EXECUTE ON FUNCTION public.is_subscription_active(TEXT, TIMESTAMPTZ) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Update get_active_subscription
-- ─────────────────────────────────────────────────────────────────────────────
-- Now returns is_active=FALSE when trial_ends_at has passed.
-- Also adds monthly_ai_agent_conversations to the output (was missing).
-- Must DROP first because we're changing the return type.
DROP FUNCTION IF EXISTS public.get_active_subscription(UUID);
CREATE OR REPLACE FUNCTION public.get_active_subscription(p_org_id UUID)
RETURNS TABLE (
  subscription_id           UUID,
  plan_id                   TEXT,
  plan_name                 TEXT,
  status                    TEXT,
  trial_ends_at             TIMESTAMPTZ,
  current_period_end        TIMESTAMPTZ,
  cancel_at_period_end      BOOLEAN,
  is_active                 BOOLEAN,
  -- limits
  max_users                 INTEGER,
  max_contacts              INTEGER,
  max_active_deals          INTEGER,
  monthly_ai_analyses       INTEGER,
  monthly_ai_objections     INTEGER,
  monthly_automated_messages INTEGER,
  monthly_email_sends       INTEGER,
  monthly_ai_agent_conversations INTEGER,
  -- feature flags
  feature_meta_ads          BOOLEAN,
  feature_ai_agent          BOOLEAN,
  feature_email_campaigns   BOOLEAN,
  feature_api_access        BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    s.id                     AS subscription_id,
    p.id                     AS plan_id,
    p.name                   AS plan_name,
    s.status,
    s.trial_ends_at,
    s.current_period_end,
    s.cancel_at_period_end,
    -- is_active: correctly accounts for expired internal trials
    public.is_subscription_active(s.status, s.trial_ends_at) AS is_active,
    p.max_users,
    p.max_contacts,
    p.max_active_deals,
    p.monthly_ai_analyses,
    p.monthly_ai_objections,
    p.monthly_automated_messages,
    p.monthly_email_sends,
    p.monthly_ai_agent_conversations,
    p.feature_meta_ads,
    p.feature_ai_agent,
    p.feature_email_campaigns,
    p.feature_api_access
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = p_org_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_subscription(UUID) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Update consume_ai_credit to check trial_ends_at
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.consume_ai_credit(
  p_org_id UUID,
  p_kind   TEXT,
  p_amount INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit        INTEGER;
  v_used         INTEGER;
  v_period_start TIMESTAMPTZ;
  v_period_end   TIMESTAMPTZ;
  v_boost_id     UUID;
  v_boost_left   INTEGER;
BEGIN
  IF p_kind NOT IN ('analyses', 'objections') THEN
    RAISE EXCEPTION 'Invalid AI credit kind: %', p_kind;
  END IF;

  -- Resolve the org's plan limit — only for ACTIVE subscriptions
  -- (includes the trial expiry check via is_subscription_active)
  SELECT
    CASE p_kind
      WHEN 'analyses'   THEN p.monthly_ai_analyses
      WHEN 'objections' THEN p.monthly_ai_objections
    END
  INTO v_limit
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = p_org_id
    AND public.is_subscription_active(s.status, s.trial_ends_at);

  IF NOT FOUND THEN
    RETURN FALSE; -- no active subscription (includes expired trial)
  END IF;

  -- Compute the current calendar-month window
  v_period_start := date_trunc('month', NOW());
  v_period_end   := v_period_start + INTERVAL '1 month';

  -- Upsert the counter row
  INSERT INTO public.usage_counters (organization_id, period_start, period_end)
  VALUES (p_org_id, v_period_start, v_period_end)
  ON CONFLICT (organization_id, period_start) DO NOTHING;

  -- Get current usage
  IF p_kind = 'analyses' THEN
    SELECT ai_analyses_used INTO v_used
    FROM public.usage_counters
    WHERE organization_id = p_org_id AND period_start = v_period_start;
  ELSE
    SELECT ai_objections_used INTO v_used
    FROM public.usage_counters
    WHERE organization_id = p_org_id AND period_start = v_period_start;
  END IF;

  v_used := COALESCE(v_used, 0);

  -- NULL limit = unlimited
  IF v_limit IS NOT NULL AND (v_used + p_amount) > v_limit THEN
    -- Try boost credits before hard-blocking
    SELECT id, credits_remaining INTO v_boost_id, v_boost_left
    FROM public.ai_boost_credits
    WHERE organization_id = p_org_id AND credits_remaining >= p_amount
    ORDER BY created_at
    LIMIT 1;

    IF v_boost_id IS NULL THEN
      RETURN FALSE; -- over limit, no boost available
    END IF;

    -- Decrement boost credits
    UPDATE public.ai_boost_credits
    SET credits_remaining = credits_remaining - p_amount
    WHERE id = v_boost_id;
    RETURN TRUE;
  END IF;

  -- Increment the monthly counter
  IF p_kind = 'analyses' THEN
    UPDATE public.usage_counters
    SET ai_analyses_used = ai_analyses_used + p_amount
    WHERE organization_id = p_org_id AND period_start = v_period_start;
  ELSE
    UPDATE public.usage_counters
    SET ai_objections_used = ai_objections_used + p_amount
    WHERE organization_id = p_org_id AND period_start = v_period_start;
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_ai_credit(UUID, TEXT, INTEGER) TO authenticated, service_role;
