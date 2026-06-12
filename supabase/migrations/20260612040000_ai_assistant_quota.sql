-- AI assistant usage quota — mirrors the existing per-feature quota pattern
-- (monthly limit on plans + used counter on usage_counters + consume_* function).

-- 1) Per-plan monthly limit (NULL = unlimited).
alter table public.plans add column if not exists monthly_ai_assistant integer;

update public.plans set monthly_ai_assistant = 100   where id = 'starter';
update public.plans set monthly_ai_assistant = 1000  where id = 'pro';
update public.plans set monthly_ai_assistant = 10000 where id = 'business'; -- effectively unlimited, capped for abuse

-- 2) Monthly used counter.
alter table public.usage_counters add column if not exists ai_assistant_used integer not null default 0;

-- 3) Consume function: returns TRUE if within quota (and increments), FALSE if over.
create or replace function public.consume_ai_assistant_quota(p_org_id uuid, p_amount integer default 1)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_limit        integer;
  v_used         integer;
  v_period_start timestamptz;
  v_period_end   timestamptz;
begin
  select p.monthly_ai_assistant
  into v_limit
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.organization_id = p_org_id
    and s.status in ('trialing_internal', 'trialing', 'active');

  if not found then
    return false;          -- no active subscription
  end if;

  if v_limit is null then
    return true;           -- unlimited
  end if;

  v_period_start := date_trunc('month', now());
  v_period_end   := v_period_start + interval '1 month';

  insert into public.usage_counters (organization_id, period_start, period_end)
  values (p_org_id, v_period_start, v_period_end)
  on conflict (organization_id, period_start) do nothing;

  select ai_assistant_used into v_used
  from public.usage_counters
  where organization_id = p_org_id and period_start = v_period_start
  for update;

  if coalesce(v_used, 0) + p_amount <= v_limit then
    update public.usage_counters
      set ai_assistant_used = coalesce(ai_assistant_used, 0) + p_amount, updated_at = now()
      where organization_id = p_org_id and period_start = v_period_start;
    return true;
  end if;

  return false;
end;
$$;

grant execute on function public.consume_ai_assistant_quota(uuid, integer) to authenticated, service_role;

-- 4) Expose the new limit in get_active_subscription so the UI can show it.
drop function if exists public.get_active_subscription(uuid);
create or replace function public.get_active_subscription(p_org_id uuid)
returns table(
  subscription_id uuid, plan_id text, plan_name text, status text,
  trial_ends_at timestamptz, current_period_end timestamptz, cancel_at_period_end boolean,
  is_active boolean, max_users integer, max_contacts integer, max_active_deals integer,
  monthly_ai_analyses integer, monthly_ai_objections integer, monthly_automated_messages integer,
  monthly_email_sends integer, monthly_ai_agent_conversations integer, monthly_ai_assistant integer,
  feature_meta_ads boolean, feature_ai_agent boolean, feature_email_campaigns boolean, feature_api_access boolean
)
language sql stable security definer set search_path to 'public'
as $$
  select
    s.id, p.id, p.name, s.status, s.trial_ends_at, s.current_period_end, s.cancel_at_period_end,
    public.is_subscription_active(s.status, s.trial_ends_at),
    p.max_users, p.max_contacts, p.max_active_deals,
    p.monthly_ai_analyses, p.monthly_ai_objections, p.monthly_automated_messages,
    p.monthly_email_sends, p.monthly_ai_agent_conversations, p.monthly_ai_assistant,
    p.feature_meta_ads, p.feature_ai_agent, p.feature_email_campaigns, p.feature_api_access
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.organization_id = p_org_id
  limit 1;
$$;
