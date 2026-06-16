-- Registry of ad accounts a given organization has synced, so the dashboard can
-- show every connected account (with results or spend-only) — not just accounts
-- that already produced attributed leads.
create table if not exists meta_org_ad_accounts (
  organization_id uuid not null,
  ad_account_id text not null,
  name text,
  currency text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (organization_id, ad_account_id)
);
alter table meta_org_ad_accounts enable row level security;
drop policy if exists org_read_meta_accounts on meta_org_ad_accounts;
create policy org_read_meta_accounts on meta_org_ad_accounts for select
  using (organization_id in (select organization_id from organization_members where user_id = auth.uid()));
drop policy if exists org_write_meta_accounts on meta_org_ad_accounts;
create policy org_write_meta_accounts on meta_org_ad_accounts for all
  using (organization_id in (select organization_id from organization_members where user_id = auth.uid()))
  with check (organization_id in (select organization_id from organization_members where user_id = auth.uid()));

-- Per-account rollup for the dashboard: every registered account for the org with
-- its inversión (sum of latest spend per campaign) + lead-driven results.
create or replace function public.dashboard_ads_accounts(p_org uuid)
returns jsonb language sql security definer set search_path to 'public' as $function$
  with reg as (select ad_account_id, name from meta_org_ad_accounts where organization_id=p_org),
  mc as (select distinct on (campaign_id) campaign_id, ad_account_id, spend from meta_campaigns order by campaign_id, created_at desc),
  spend_by_acct as (select ad_account_id, sum(spend) spend from mc group by ad_account_id),
  leads_by_acct as (
    select mc.ad_account_id,
      count(distinct c.id) leads,
      count(distinct m.id) citas,
      count(distinct c.id) filter (where s.name ilike '%ganad%') cierres,
      coalesce(sum(c.budget) filter (where s.name ilike '%ganad%'),0) revenue
    from contacts c
    join mc on mc.campaign_id=c.meta_campaign_id
    left join pipeline_stages s on s.id=c.stage_id
    left join meetings m on m.contact_id=c.id
    where c.organization_id=p_org and c.meta_campaign_id is not null
    group by mc.ad_account_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'account', reg.ad_account_id, 'name', reg.name, 'spend', sp.spend,
    'leads', coalesce(l.leads,0), 'citas', coalesce(l.citas,0), 'cierres', coalesce(l.cierres,0),
    'revenue', coalesce(l.revenue,0),
    'roas', case when sp.spend>0 and l.revenue>0 then round((l.revenue/sp.spend)::numeric,2) else null end
  ) order by sp.spend desc nulls last), '[]'::jsonb)
  from reg
  left join spend_by_acct sp on sp.ad_account_id=reg.ad_account_id
  left join leads_by_acct l on l.ad_account_id=reg.ad_account_id;
$function$;
