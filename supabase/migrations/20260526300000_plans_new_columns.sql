-- Migration: add new plan columns for Klosify pricing v2
-- New columns: max_published_landings, max_automation_flows, feature_ig_automations
-- Also adds ia_landings_credits table for tracking landing credit packs

-- ── New plan columns ──────────────────────────────────────────────────────────

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_published_landings INTEGER,
  ADD COLUMN IF NOT EXISTS max_automation_flows   INTEGER,       -- NULL = unlimited
  ADD COLUMN IF NOT EXISTS feature_ig_automations BOOLEAN NOT NULL DEFAULT false;

-- ── Update plan limits to new pricing structure ───────────────────────────────

UPDATE public.plans SET
  monthly_price_usd         = 29,
  annual_price_usd          = 290,
  max_users                 = 1,
  max_contacts              = 500,
  max_active_deals          = 50,
  max_published_landings    = 3,
  max_automation_flows      = 3,
  monthly_automated_messages = 500,
  monthly_ai_analyses       = NULL,   -- IA Boost not included in Starter
  monthly_ai_objections     = NULL,
  monthly_email_sends       = 500,
  feature_meta_ads          = true,
  feature_email_campaigns   = true,
  feature_api_access        = false,
  feature_priority_support  = false,
  feature_ig_automations    = false
WHERE id = 'starter';

UPDATE public.plans SET
  monthly_price_usd         = 39,
  annual_price_usd          = 390,
  max_users                 = 3,
  max_contacts              = 5000,
  max_active_deals          = NULL,   -- unlimited
  max_published_landings    = 15,
  max_automation_flows      = NULL,   -- unlimited
  monthly_automated_messages = 3000,
  monthly_ai_analyses       = 1000,  -- IA Boost 1,000 contacts/mes
  monthly_ai_objections     = 1000,
  monthly_email_sends       = 5000,
  feature_meta_ads          = true,
  feature_email_campaigns   = true,
  feature_api_access        = false,
  feature_priority_support  = false,
  feature_ig_automations    = true
WHERE id = 'pro';

UPDATE public.plans SET
  monthly_price_usd         = 89,
  annual_price_usd          = 890,
  max_users                 = 10,
  max_contacts              = NULL,   -- unlimited
  max_active_deals          = NULL,   -- unlimited
  max_published_landings    = 50,
  max_automation_flows      = NULL,   -- unlimited
  monthly_automated_messages = NULL,  -- unlimited
  monthly_ai_analyses       = 5000,  -- IA Boost 5,000 contacts/mes
  monthly_ai_objections     = 5000,
  monthly_email_sends       = NULL,   -- unlimited
  feature_meta_ads          = true,
  feature_email_campaigns   = true,
  feature_api_access        = true,
  feature_priority_support  = true,
  feature_ig_automations    = true
WHERE id = 'business';

-- ── IA Landings credits table ─────────────────────────────────────────────────
-- Same pattern as ai_boost_credits — stores purchased credit packs

CREATE TABLE IF NOT EXISTS public.ia_landings_credits (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  credits_initial           INTEGER NOT NULL,
  credits_remaining         INTEGER NOT NULL,
  stripe_payment_intent_id  TEXT UNIQUE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ia_landings_credits_org_idx
  ON public.ia_landings_credits(organization_id);

ALTER TABLE public.ia_landings_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read_landings_credits"
  ON public.ia_landings_credits FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- ── Update get_active_subscription RPC to include new columns ─────────────────
-- Drop and recreate so it returns the new plan fields

DROP FUNCTION IF EXISTS public.get_active_subscription(uuid);

CREATE OR REPLACE FUNCTION public.get_active_subscription(p_org_id uuid)
RETURNS TABLE (
  subscription_id         TEXT,
  plan_id                 TEXT,
  plan_name               TEXT,
  status                  TEXT,
  trial_ends_at           TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancel_at_period_end    BOOLEAN,
  is_active               BOOLEAN,
  -- limits
  max_users               INTEGER,
  max_contacts            INTEGER,
  max_active_deals        INTEGER,
  max_published_landings  INTEGER,
  max_automation_flows    INTEGER,
  monthly_automated_messages INTEGER,
  monthly_ai_analyses     INTEGER,
  monthly_ai_objections   INTEGER,
  monthly_email_sends     INTEGER,
  -- feature flags
  feature_meta_ads        BOOLEAN,
  feature_email_campaigns BOOLEAN,
  feature_api_access      BOOLEAN,
  feature_priority_support BOOLEAN,
  feature_ig_automations  BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    s.id::TEXT                  AS subscription_id,
    p.id                        AS plan_id,
    p.name                      AS plan_name,
    s.status                    AS status,
    s.trial_ends_at             AS trial_ends_at,
    s.current_period_end        AS current_period_end,
    s.cancel_at_period_end      AS cancel_at_period_end,
    (
      s.status IN ('trialing_internal', 'trialing', 'active')
      OR (
        s.status = 'trialing_internal'
        AND (s.trial_ends_at IS NULL OR s.trial_ends_at > NOW())
      )
    )                            AS is_active,
    p.max_users,
    p.max_contacts,
    p.max_active_deals,
    p.max_published_landings,
    p.max_automation_flows,
    p.monthly_automated_messages,
    p.monthly_ai_analyses,
    p.monthly_ai_objections,
    p.monthly_email_sends,
    p.feature_meta_ads,
    p.feature_email_campaigns,
    p.feature_api_access,
    p.feature_priority_support,
    COALESCE(p.feature_ig_automations, false) AS feature_ig_automations
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = p_org_id
  ORDER BY s.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_subscription(uuid) TO authenticated;
