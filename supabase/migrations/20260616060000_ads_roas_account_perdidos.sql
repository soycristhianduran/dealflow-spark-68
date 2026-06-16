-- Dashboard Meta Ads ROAS: add ad-account breakdown + lost (perdidos) count so a
-- business with multiple ad accounts can see results per account.
create or replace function public.dashboard_ads_roas(p_org uuid, p_level text default 'campaign')
returns jsonb language sql security definer set search_path to 'public' as $function$
  with mc as (select distinct on (campaign_id) campaign_id key, ad_account_id, spend from meta_campaigns order by campaign_id, created_at desc),
  ma as (select distinct on (ad_id) ad_id key, ad_account_id, spend from meta_ads order by ad_id, created_at desc),
  leadcamp as (
    select c.id,
      case when p_level='ad' then c.meta_ad_id else c.meta_campaign_id end as ekey,
      case when p_level='ad' then nullif(c.ad,'') else nullif(c.campaign,'') end as ename,
      c.stage_id, c.budget
    from contacts c
    where c.organization_id=p_org
      and (case when p_level='ad' then c.meta_ad_id else c.meta_campaign_id end) is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ekey, 'campaign', coalesce(ename, ekey), 'account', account, 'spend', spend,
    'leads', leads, 'citas', citas, 'cierres', cierres, 'perdidos', perdidos, 'revenue', revenue,
    'roas', case when spend>0 and revenue>0 then round((revenue/spend)::numeric,2) else null end,
    'cpl', case when spend>0 and leads>0 then round((spend/leads)::numeric,0) else null end
  ) order by (spend is null), leads desc), '[]'::jsonb)
  from (
    select lc.ekey, max(lc.ename) ename,
      max(case when p_level='ad' then ma.ad_account_id else mc.ad_account_id end) account,
      max(case when p_level='ad' then ma.spend else mc.spend end) spend,
      count(distinct lc.id) leads,
      count(distinct m.id) citas,
      count(distinct lc.id) filter (where s.name ilike '%ganad%') cierres,
      count(distinct lc.id) filter (where s.name ilike '%perdid%') perdidos,
      coalesce(sum(lc.budget) filter (where s.name ilike '%ganad%'),0) revenue
    from leadcamp lc
    left join mc on p_level='campaign' and mc.key=lc.ekey
    left join ma on p_level='ad' and ma.key=lc.ekey
    left join pipeline_stages s on s.id=lc.stage_id
    left join meetings m on m.contact_id=lc.id
    group by lc.ekey limit 60
  ) t;
$function$;
