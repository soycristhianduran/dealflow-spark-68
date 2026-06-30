-- Voice Agent gating + seat add-on alignment
-- ---------------------------------------------------------------------------
-- 1. Add a feature flag that controls access to the Voice Agent (Agente de Voz).
--    Starter does NOT include it; Pro / Business / Agency do.
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS feature_voice_agent BOOLEAN NOT NULL DEFAULT false;

UPDATE public.plans SET feature_voice_agent = false WHERE id = 'starter';
UPDATE public.plans SET feature_voice_agent = true  WHERE id IN ('pro', 'business', 'agency');

-- 2. Recreate get_active_subscription to expose feature_voice_agent.
--    Keeps the courtesy-seat override (max_users_override) applied live.
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
  feature_ai_agent               BOOLEAN,
  feature_voice_agent            BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    s.id::TEXT, p.id, p.name, s.status, s.trial_ends_at, s.current_period_end,
    s.cancel_at_period_end,
    (s.status IN ('trialing_internal','trialing','active')
     OR (s.status = 'trialing_internal' AND (s.trial_ends_at IS NULL OR s.trial_ends_at > NOW())))      AS is_active,
    COALESCE(s.max_users_override, p.max_users), p.max_contacts, p.max_active_deals,
    p.max_published_landings, p.max_automation_flows,
    p.monthly_automated_messages, p.monthly_ai_analyses, p.monthly_ai_objections, p.monthly_email_sends,
    p.monthly_ai_agent_conversations, p.monthly_ai_agent_credits,
    p.feature_meta_ads, p.feature_email_campaigns, p.feature_api_access, p.feature_priority_support,
    COALESCE(p.feature_ig_automations, false), COALESCE(p.feature_ai_agent, false),
    COALESCE(p.feature_voice_agent, false)
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = p_org_id
  ORDER BY s.created_at DESC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_active_subscription(uuid) TO authenticated;

-- 3. Extra-seat price ($12 -> $9): handled by the admin-setup-addons edge
--    function, which creates the $9 Stripe price server-side (secret never
--    leaves Supabase), archives the old $12 price, and writes both
--    stripe_price_id and monthly_price_usd into addon_catalog. Run it with:
--      curl -X POST .../functions/v1/admin-setup-addons \
--           -H 'x-admin-secret: klosify-addons-setup-2026'
