create or replace function public.dashboard_ads_roas(p_org uuid)
returns jsonb language sql security definer set search_path=public as $$
  with mc as (
    select distinct on (campaign_id) campaign_id, campaign_name, spend
    from meta_campaigns order by campaign_id, created_at desc
  ),
  leadcamp as (
    select c.id, c.meta_campaign_id, c.stage_id, c.budget
    from contacts c
    where c.organization_id = p_org and c.meta_campaign_id is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'campaign', coalesce(campaign_name, 'Campaña ' || campaign_id),
    'spend', spend,
    'leads', leads,
    'citas', citas,
    'cierres', cierres,
    'revenue', revenue,
    'roas', case when spend > 0 and revenue > 0 then round((revenue/spend)::numeric, 2) else null end,
    'cpl', case when spend > 0 and leads > 0 then round((spend/leads)::numeric, 0) else null end
  ) order by (spend is null), spend desc), '[]'::jsonb)
  from (
    select lc.meta_campaign_id campaign_id,
      max(mc.campaign_name) campaign_name,
      max(mc.spend) spend,
      count(distinct lc.id) leads,
      count(distinct m.id) citas,
      count(distinct lc.id) filter (where s.name ilike '%ganad%') cierres,
      coalesce(sum(lc.budget) filter (where s.name ilike '%ganad%'), 0) revenue
    from leadcamp lc
    left join mc on mc.campaign_id = lc.meta_campaign_id
    left join pipeline_stages s on s.id = lc.stage_id
    left join meetings m on m.contact_id = lc.id
    group by lc.meta_campaign_id
    limit 30
  ) t;
$$;
grant execute on function public.dashboard_ads_roas(uuid) to authenticated, service_role;
