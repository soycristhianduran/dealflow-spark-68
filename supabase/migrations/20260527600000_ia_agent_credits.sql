-- ─────────────────────────────────────────────────────────────────────────────
-- AI Agent add-on conversation credit packs
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. New plan columns for AI Agent limits
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS monthly_ai_agent_conversations INTEGER,  -- NULL = unlimited
  ADD COLUMN IF NOT EXISTS feature_ai_agent               BOOLEAN NOT NULL DEFAULT false;

-- 2. Set AI Agent limits per plan
UPDATE public.plans SET
  monthly_ai_agent_conversations = 100,
  feature_ai_agent               = true
WHERE id = 'starter';

UPDATE public.plans SET
  monthly_ai_agent_conversations = 500,
  feature_ai_agent               = true
WHERE id = 'pro';

UPDATE public.plans SET
  monthly_ai_agent_conversations = 2500,
  feature_ai_agent               = true
WHERE id = 'business';

-- 3. ia_agent_credits — purchased conversation credit packs (add-ons)
--    Same structure as ia_landings_credits / ai_boost_credits.
CREATE TABLE IF NOT EXISTS public.ia_agent_credits (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  credits_initial           INTEGER     NOT NULL,
  credits_remaining         INTEGER     NOT NULL,
  stripe_payment_intent_id  TEXT        UNIQUE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ia_agent_credits_org_idx
  ON public.ia_agent_credits(organization_id);

ALTER TABLE public.ia_agent_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read_ia_agent_credits"
  ON public.ia_agent_credits FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM   public.organization_members
      WHERE  user_id = auth.uid()
    )
  );

-- 4. Update get_active_subscription RPC to include AI Agent columns
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
  -- limits
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
  -- feature flags
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
    s.id::TEXT                    AS subscription_id,
    p.id                          AS plan_id,
    p.name                        AS plan_name,
    s.status                      AS status,
    s.trial_ends_at               AS trial_ends_at,
    s.current_period_end          AS current_period_end,
    s.cancel_at_period_end        AS cancel_at_period_end,
    (
      s.status IN ('trialing_internal', 'trialing', 'active')
      OR (
        s.status = 'trialing_internal'
        AND (s.trial_ends_at IS NULL OR s.trial_ends_at > NOW())
      )
    )                              AS is_active,
    p.max_users,
    p.max_contacts,
    p.max_active_deals,
    p.max_published_landings,
    p.max_automation_flows,
    p.monthly_automated_messages,
    p.monthly_ai_analyses,
    p.monthly_ai_objections,
    p.monthly_email_sends,
    p.monthly_ai_agent_conversations,
    p.feature_meta_ads,
    p.feature_email_campaigns,
    p.feature_api_access,
    p.feature_priority_support,
    COALESCE(p.feature_ig_automations, false) AS feature_ig_automations,
    COALESCE(p.feature_ai_agent,       false) AS feature_ai_agent
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = p_org_id
  ORDER BY s.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_subscription(uuid) TO authenticated;

-- 5. Update consume_ai_agent_session to enforce quota + overflow to add-on credits
CREATE OR REPLACE FUNCTION public.consume_ai_agent_session(
  p_org_id      UUID,
  p_channel     TEXT,
  p_session_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today        DATE        := (NOW() AT TIME ZONE 'UTC')::DATE;
  v_session_id   UUID;
  v_is_new       BOOLEAN     := false;
  v_month_start  TIMESTAMPTZ := date_trunc('month', NOW() AT TIME ZONE 'UTC');
  v_month_end    TIMESTAMPTZ := v_month_start + INTERVAL '1 month';
  v_plan_limit   INTEGER;
  v_used         INTEGER     := 0;
  v_quota_ok     BOOLEAN     := true;
  v_credit_id    UUID;
  v_used_addon   BOOLEAN     := false;
BEGIN
  -- Upsert today's session, increment message_count on every call
  INSERT INTO public.ai_agent_sessions
    (organization_id, channel, session_key, date_utc, message_count, last_message_at)
  VALUES
    (p_org_id, p_channel, p_session_key, v_today, 1, NOW())
  ON CONFLICT (organization_id, channel, session_key, date_utc)
  DO UPDATE SET
    message_count   = ai_agent_sessions.message_count + 1,
    last_message_at = NOW()
  RETURNING id, (xmax = 0) INTO v_session_id, v_is_new;

  -- Credit is consumed only on the FIRST message of a new session (one credit per day per contact)
  IF v_is_new THEN

    -- Look up the plan's monthly conversation limit
    SELECT p.monthly_ai_agent_conversations
    INTO   v_plan_limit
    FROM   public.subscriptions s
    JOIN   public.plans p ON p.id = s.plan_id
    WHERE  s.organization_id = p_org_id
      AND  s.status IN ('active', 'trialing', 'trialing_internal')
    ORDER  BY s.created_at DESC
    LIMIT  1;

    -- If there is a limit (NULL = unlimited), check current usage
    IF v_plan_limit IS NOT NULL THEN
      SELECT COALESCE(uc.ai_agent_conversations_used, 0)
      INTO   v_used
      FROM   public.usage_counters uc
      WHERE  uc.organization_id = p_org_id
        AND  uc.period_start    = v_month_start;

      IF v_used >= v_plan_limit THEN
        -- Plan quota exhausted — try add-on credits (oldest pack first)
        SELECT id
        INTO   v_credit_id
        FROM   public.ia_agent_credits
        WHERE  organization_id  = p_org_id
          AND  credits_remaining > 0
        ORDER  BY created_at ASC
        LIMIT  1;

        IF v_credit_id IS NULL THEN
          -- No add-on credits either — reject this session
          v_quota_ok := false;
        ELSE
          UPDATE public.ia_agent_credits
          SET    credits_remaining = credits_remaining - 1,
                 updated_at        = NOW()
          WHERE  id = v_credit_id;
          v_used_addon := true;
        END IF;
      END IF;
    END IF;

    -- Increment the usage counter (always, even when using add-on credits)
    IF v_quota_ok THEN
      INSERT INTO public.usage_counters
        (organization_id, period_start, period_end, ai_agent_conversations_used)
      VALUES
        (p_org_id, v_month_start, v_month_end, 1)
      ON CONFLICT (organization_id, period_start)
      DO UPDATE SET
        ai_agent_conversations_used =
          usage_counters.ai_agent_conversations_used + 1,
        updated_at = NOW();
    END IF;

  END IF;

  RETURN jsonb_build_object(
    'session_id',        v_session_id,
    'is_new_session',    v_is_new,
    'quota_exceeded',    NOT v_quota_ok,
    'used_addon_credit', v_used_addon
  );
END;
$$;
