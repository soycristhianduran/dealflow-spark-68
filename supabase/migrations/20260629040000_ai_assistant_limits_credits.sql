-- AI Assistant: per-plan monthly limits + purchasable credit packs
-- ---------------------------------------------------------------------------
-- 1. New monthly limits: Starter 30, Pro 100, Business 300 (Agency unchanged).
UPDATE public.plans SET monthly_ai_assistant = 30  WHERE id = 'starter';
UPDATE public.plans SET monthly_ai_assistant = 100 WHERE id = 'pro';
UPDATE public.plans SET monthly_ai_assistant = 300 WHERE id = 'business';

-- 2. Purchasable extra-assistance credits (mirrors ia_agent_credits).
CREATE TABLE IF NOT EXISTS public.ai_assistant_credits (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  credits_initial          INTEGER     NOT NULL,
  credits_remaining        INTEGER     NOT NULL,
  stripe_payment_intent_id TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_assistant_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_assistant_credits_org_select ON public.ai_assistant_credits;
CREATE POLICY ai_assistant_credits_org_select
  ON public.ai_assistant_credits FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- 3. consume_ai_assistant_quota: monthly quota first, then fall back to
--    purchased credit packs (oldest first). Returns true if a use was granted.
CREATE OR REPLACE FUNCTION public.consume_ai_assistant_quota(p_org_id uuid, p_amount integer DEFAULT 1)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_limit        integer;
  v_used         integer;
  v_period_start timestamptz;
  v_period_end   timestamptz;
  v_credit       record;
begin
  select p.monthly_ai_assistant into v_limit
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.organization_id = p_org_id
    and s.status in ('trialing_internal', 'trialing', 'active');

  if not found then return false; end if;       -- no active subscription
  if v_limit is null then return true; end if;  -- unlimited plan

  v_period_start := date_trunc('month', now());
  v_period_end   := v_period_start + interval '1 month';

  insert into public.usage_counters (organization_id, period_start, period_end)
  values (p_org_id, v_period_start, v_period_end)
  on conflict (organization_id, period_start) do nothing;

  select ai_assistant_used into v_used
  from public.usage_counters
  where organization_id = p_org_id and period_start = v_period_start
  for update;

  -- a) within the monthly plan quota
  if coalesce(v_used, 0) + p_amount <= v_limit then
    update public.usage_counters
      set ai_assistant_used = coalesce(ai_assistant_used, 0) + p_amount, updated_at = now()
      where organization_id = p_org_id and period_start = v_period_start;
    return true;
  end if;

  -- b) monthly quota exhausted → consume purchased credits (oldest pack first)
  select id, credits_remaining into v_credit
  from public.ai_assistant_credits
  where organization_id = p_org_id and credits_remaining >= p_amount
  order by created_at asc
  limit 1
  for update;

  if found then
    update public.ai_assistant_credits
      set credits_remaining = credits_remaining - p_amount, updated_at = now()
      where id = v_credit.id;
    return true;
  end if;

  return false;
end;
$function$;

-- 4. Expose monthly_ai_assistant via get_active_subscription so the UI shows the
--    real limit (it was omitted, so the app rendered the assistant as unlimited).
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
  monthly_ai_assistant           INTEGER,
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
    p.monthly_ai_agent_conversations, p.monthly_ai_agent_credits, p.monthly_ai_assistant,
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
