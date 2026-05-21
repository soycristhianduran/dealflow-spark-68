-- ============================================================================
-- Billing schema for Velocity CRM
-- ============================================================================
-- 4 tables to support the SaaS subscription model:
--
--   plans              — static config (the 3 tiers + their limits)
--   subscriptions      — one per organization, mirrors Stripe state
--   usage_counters     — monthly counters per org for AI / messages / emails
--   ai_boost_credits   — one-time AI purchases, decremented as used
--
-- Plus helper functions used by the application code:
--
--   get_active_subscription(org_id)     — current row for an org
--   consume_ai_credit(org_id)           — atomic counter increment with limit check
--   start_internal_trial(org_id)        — called from signup flow
--   refresh_usage_period(org_id)        — rolls the counter when month flips
--
-- The Stripe `price_id` columns in `plans` start NULL — you fill them via
-- UPDATE after creating the products in Stripe Dashboard. See migration
-- 20260520010001 (template) for the UPDATE statements.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. plans (static config)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plans (
  id TEXT PRIMARY KEY,                 -- 'starter' / 'pro' / 'business'
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL,      -- ordering in pricing table

  monthly_price_usd NUMERIC(8,2) NOT NULL,
  annual_price_usd  NUMERIC(8,2) NOT NULL,

  -- Stripe price IDs — populated after creating products in Stripe Dashboard.
  -- Use the migration template `20260520010001_billing_stripe_price_ids.sql`
  -- to fill them in (it's intentionally a separate migration so you can
  -- re-run it without re-applying the whole schema).
  stripe_price_id_monthly TEXT,
  stripe_price_id_annual  TEXT,

  -- Limits (NULL = unlimited)
  max_users          INTEGER,
  max_contacts       INTEGER,
  max_active_deals   INTEGER,
  max_wa_accounts    INTEGER,
  max_ig_accounts    INTEGER,
  max_fb_accounts    INTEGER,

  monthly_automated_messages INTEGER,
  monthly_ai_analyses        INTEGER,
  monthly_ai_objections      INTEGER,
  monthly_email_sends        INTEGER,

  -- Feature flags
  feature_meta_ads          BOOLEAN NOT NULL DEFAULT FALSE,
  feature_email_campaigns   BOOLEAN NOT NULL DEFAULT FALSE,
  feature_api_access        BOOLEAN NOT NULL DEFAULT FALSE,
  feature_priority_support  BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_public_read" ON public.plans
  FOR SELECT TO authenticated, anon USING (true);
-- Writes are service-role only (no policy needed; service_role bypasses RLS).

-- Seed the 3 plans. Limits match the pricing table we agreed on.
INSERT INTO public.plans (
  id, name, display_order, monthly_price_usd, annual_price_usd,
  max_users, max_contacts, max_active_deals,
  max_wa_accounts, max_ig_accounts, max_fb_accounts,
  monthly_automated_messages, monthly_ai_analyses, monthly_ai_objections, monthly_email_sends,
  feature_meta_ads, feature_email_campaigns, feature_api_access, feature_priority_support
) VALUES
  ('starter',  'Starter',  1, 14, 140,
    1, 1000,  100,    1, 1, 1,
    100,  20,  50,     0,
    FALSE, FALSE, FALSE, FALSE),
  ('pro',      'Pro',      2, 39, 390,
    3, 10000, NULL,   3, 3, 3,
    1000, 200, 500,   1000,
    TRUE,  TRUE,  FALSE, FALSE),
  ('business', 'Business', 3, 79, 790,
    10, NULL, NULL,   NULL, NULL, NULL,
    5000, 1500, NULL, 10000,
    TRUE, TRUE, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. subscriptions (one per organization)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE
    REFERENCES public.organizations(id) ON DELETE CASCADE,

  plan_id TEXT NOT NULL REFERENCES public.plans(id),

  -- Stripe identifiers — NULL during the internal trial (before any payment).
  stripe_customer_id     TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,

  -- Status — mirrors Stripe's status with one extra value `trialing_internal`
  -- for our own 14-day pre-payment trial (no Stripe subscription exists yet).
  status TEXT NOT NULL CHECK (status IN (
    'trialing_internal',
    'trialing',
    'active',
    'past_due',
    'canceled',
    'incomplete',
    'incomplete_expired',
    'unpaid'
  )),

  trial_ends_at         TIMESTAMPTZ,
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  cancel_at_period_end  BOOLEAN NOT NULL DEFAULT FALSE,

  billing_interval TEXT CHECK (billing_interval IN ('month', 'year', NULL)),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org_id ON public.subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_ends ON public.subscriptions(trial_ends_at)
  WHERE status = 'trialing_internal';

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Members of the org can read their own subscription row.
CREATE POLICY "subscriptions_org_select" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- Writes go through Edge Functions (service_role bypasses RLS).
-- No write policy needed — default deny for client writes.


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. usage_counters (monthly, per organization)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.usage_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,

  period_start TIMESTAMPTZ NOT NULL,
  period_end   TIMESTAMPTZ NOT NULL,

  ai_analyses_used       INTEGER NOT NULL DEFAULT 0,
  ai_objections_used     INTEGER NOT NULL DEFAULT 0,
  automated_messages_used INTEGER NOT NULL DEFAULT 0,
  email_sends_used       INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (organization_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_counters_org_period
  ON public.usage_counters(organization_id, period_start DESC);

ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usage_counters_org_select" ON public.usage_counters
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
-- Writes are service-role only.


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ai_boost_credits (one-time top-up purchases)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_boost_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,

  credits_remaining INTEGER NOT NULL CHECK (credits_remaining >= 0),
  credits_initial   INTEGER NOT NULL,         -- for accounting / auditing

  stripe_payment_intent_id TEXT UNIQUE,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_boost_credits_org
  ON public.ai_boost_credits(organization_id)
  WHERE credits_remaining > 0;

ALTER TABLE public.ai_boost_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_boost_credits_org_select" ON public.ai_boost_credits
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
-- Writes are service-role only.


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Helper: start_internal_trial(org_id)
-- ─────────────────────────────────────────────────────────────────────────────
-- Called from the signup flow (or a trigger on organizations INSERT) to
-- bootstrap a new org's 14-day trial on the Pro plan. Idempotent.

CREATE OR REPLACE FUNCTION public.start_internal_trial(p_org_id UUID)
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions;
BEGIN
  -- Already has a subscription? Return it.
  SELECT * INTO v_sub FROM public.subscriptions WHERE organization_id = p_org_id;
  IF FOUND THEN
    RETURN v_sub;
  END IF;

  INSERT INTO public.subscriptions (
    organization_id, plan_id, status,
    trial_ends_at,
    current_period_start, current_period_end
  ) VALUES (
    p_org_id, 'pro', 'trialing_internal',
    NOW() + INTERVAL '14 days',
    NOW(), NOW() + INTERVAL '14 days'
  )
  RETURNING * INTO v_sub;

  -- Seed the first usage counter row
  INSERT INTO public.usage_counters (organization_id, period_start, period_end)
  VALUES (p_org_id, date_trunc('month', NOW()), date_trunc('month', NOW()) + INTERVAL '1 month')
  ON CONFLICT (organization_id, period_start) DO NOTHING;

  RETURN v_sub;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_internal_trial(UUID) TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Helper: get_active_subscription(org_id)
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns the row PLUS the plan limits joined, so the frontend gets
-- everything it needs in one call. Used by the "Billing" page and the
-- middleware that gates feature access.

CREATE OR REPLACE FUNCTION public.get_active_subscription(p_org_id UUID)
RETURNS TABLE (
  subscription_id UUID,
  plan_id TEXT,
  plan_name TEXT,
  status TEXT,
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN,
  is_active BOOLEAN,
  -- limits (NULL = unlimited)
  max_users INTEGER,
  max_contacts INTEGER,
  max_active_deals INTEGER,
  monthly_ai_analyses INTEGER,
  monthly_ai_objections INTEGER,
  monthly_automated_messages INTEGER,
  monthly_email_sends INTEGER,
  feature_meta_ads BOOLEAN,
  feature_email_campaigns BOOLEAN,
  feature_api_access BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    s.id, p.id, p.name, s.status, s.trial_ends_at,
    s.current_period_end, s.cancel_at_period_end,
    -- is_active = the user can actually use the app right now
    s.status IN ('trialing_internal', 'trialing', 'active') AS is_active,
    p.max_users, p.max_contacts, p.max_active_deals,
    p.monthly_ai_analyses, p.monthly_ai_objections,
    p.monthly_automated_messages, p.monthly_email_sends,
    p.feature_meta_ads, p.feature_email_campaigns, p.feature_api_access
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = p_org_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_subscription(UUID) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Helper: consume_ai_credit(org_id, kind, amount)
-- ─────────────────────────────────────────────────────────────────────────────
-- Atomic counter increment with limit check. Called from any Edge Function
-- that runs an AI op (analyze-contact-ai, etc.) BEFORE actually invoking
-- the AI provider.
--
-- `kind` = 'analyses' or 'objections'
-- Returns TRUE if there was enough budget (counter incremented).
-- Returns FALSE if over the limit AND no boost credits available.

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
  v_limit       INTEGER;
  v_used        INTEGER;
  v_period_start TIMESTAMPTZ;
  v_period_end   TIMESTAMPTZ;
  v_boost_id     UUID;
  v_boost_left   INTEGER;
BEGIN
  IF p_kind NOT IN ('analyses', 'objections') THEN
    RAISE EXCEPTION 'Invalid AI credit kind: %', p_kind;
  END IF;

  -- Resolve the org's plan limit for this kind of AI op
  SELECT
    CASE p_kind
      WHEN 'analyses'   THEN p.monthly_ai_analyses
      WHEN 'objections' THEN p.monthly_ai_objections
    END
  INTO v_limit
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = p_org_id
    AND s.status IN ('trialing_internal', 'trialing', 'active');

  IF NOT FOUND THEN
    RETURN FALSE; -- no active subscription
  END IF;

  -- Compute the current calendar-month window
  v_period_start := date_trunc('month', NOW());
  v_period_end   := v_period_start + INTERVAL '1 month';

  -- Upsert the counter row (in case it doesn't exist yet)
  INSERT INTO public.usage_counters (organization_id, period_start, period_end)
  VALUES (p_org_id, v_period_start, v_period_end)
  ON CONFLICT (organization_id, period_start) DO NOTHING;

  -- Read current usage
  SELECT
    CASE p_kind
      WHEN 'analyses'   THEN ai_analyses_used
      WHEN 'objections' THEN ai_objections_used
    END
  INTO v_used
  FROM public.usage_counters
  WHERE organization_id = p_org_id AND period_start = v_period_start
  FOR UPDATE;  -- row lock to prevent concurrent over-spending

  -- Under the plan limit? Increment and return TRUE.
  IF v_limit IS NULL OR v_used + p_amount <= v_limit THEN
    IF p_kind = 'analyses' THEN
      UPDATE public.usage_counters
        SET ai_analyses_used = ai_analyses_used + p_amount,
            updated_at = NOW()
        WHERE organization_id = p_org_id AND period_start = v_period_start;
    ELSE
      UPDATE public.usage_counters
        SET ai_objections_used = ai_objections_used + p_amount,
            updated_at = NOW()
        WHERE organization_id = p_org_id AND period_start = v_period_start;
    END IF;
    RETURN TRUE;
  END IF;

  -- Over the plan limit. Try to consume a Boost credit.
  -- (Analyses-kind only — objections always covered by plan.)
  IF p_kind = 'analyses' THEN
    SELECT id, credits_remaining INTO v_boost_id, v_boost_left
    FROM public.ai_boost_credits
    WHERE organization_id = p_org_id AND credits_remaining >= p_amount
    ORDER BY purchased_at ASC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.ai_boost_credits
        SET credits_remaining = credits_remaining - p_amount
        WHERE id = v_boost_id;
      RETURN TRUE;
    END IF;
  END IF;

  -- No budget left
  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_ai_credit(UUID, TEXT, INTEGER) TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. updated_at auto-update trigger
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscriptions_touch_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_touch_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS usage_counters_touch_updated_at ON public.usage_counters;
CREATE TRIGGER usage_counters_touch_updated_at
  BEFORE UPDATE ON public.usage_counters
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
