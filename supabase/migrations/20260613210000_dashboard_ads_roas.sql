create or replace function public.dashboard_ads_roas(p_org uuid, p_level text default 'campaign')
returns jsonb language sql security definer set search_path=public as $$
  with mc as (
    select distinct on (campaign_id) campaign_id key, campaign_name name, spend
    from meta_campaigns order by campaign_id, created_at desc
  ),
  ma as (
    select distinct on (ad_id) ad_id key, ad_name name, spend
    from meta_ads order by ad_id, created_at desc
  ),
  src as (
    select key, name, spend from mc where p_level = 'campaign'
    union all
    select key, name, spend from ma where p_level = 'ad'
  ),
  leadcamp as (
    select c.id,
      case when p_level = 'ad' then c.meta_ad_id else c.meta_campaign_id end as ekey,
      c.stage_id, c.budget
    from contacts c
    where c.organization_id = p_org
      and (case when p_level = 'ad' then c.meta_ad_id else c.meta_campaign_id end) is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'campaign', coalesce(name, ekey),
    'spend', spend,
    'leads', leads,
    'citas', citas,
    'cierres', cierres,
    'revenue', revenue,
    'roas', case when spend > 0 and revenue > 0 then round((revenue/spend)::numeric, 2) else null end,
    'cpl', case when spend > 0 and leads > 0 then round((spend/leads)::numeric, 0) else null end
  ) order by (spend is null), spend desc), '[]'::jsonb)
  from (
    select lc.ekey,
      max(src.name) name,
      max(src.spend) spend,
      count(distinct lc.id) leads,
      count(distinct m.id) citas,
      count(distinct lc.id) filter (where s.name ilike '%ganad%') cierres,
      coalesce(sum(lc.budget) filter (where s.name ilike '%ganad%'), 0) revenue
    from leadcamp lc
    left join src on src.key = lc.ekey
    left join pipeline_stages s on s.id = lc.stage_id
    left join meetings m on m.contact_id = lc.id
    group by lc.ekey
    limit 30
  ) t;
$$;
grant execute on function public.dashboard_ads_roas(uuid, text) to authenticated, service_role;
