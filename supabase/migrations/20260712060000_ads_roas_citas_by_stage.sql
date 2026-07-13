CREATE OR REPLACE FUNCTION public.dashboard_ads_roas(p_org uuid, p_level text DEFAULT 'campaign'::text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with cfg as (
  select coalesce(nullif(vendor_conversion_base,''),'leads') base from organizations where id=p_org
),
ent as (
  select case when p_level='ad' then ad_id else campaign_id end as ekey,
         max(ad_account_id) as account,
         max(case when p_level='ad' then ad_name else null end) as ad_name,
         max(campaign_id) as campaign_id,
         sum(coalesce(spend,0)) as spend,
         sum(coalesce(leads,0)) as ad_leads
  from meta_ads
  where organization_id=p_org and (case when p_level='ad' then ad_id else campaign_id end) is not null
  group by 1
),
cn as (select distinct on (campaign_id) campaign_id, campaign_name from meta_campaigns order by campaign_id, created_at desc),
lm as (
  select case when p_level='ad' then c.meta_ad_id else c.meta_campaign_id end as ekey,
         max(case when p_level='ad' then nullif(c.ad,'') else nullif(c.campaign,'') end) as ename,
         count(distinct c.id) as leads,
         -- Citas: base 'appointments' = leads que llegaron a la etapa de cita
         -- (o pasaron por ella según el timeline); 'leads' = reuniones (histórico).
         case when (select base from cfg) = 'appointments' then
           count(distinct c.id) filter (where
             s.name ilike '%agenda cita%' or s.name ilike '%cita confirmada%'
             or s.name ilike '%no asiste%' or s.name ilike '%ganad%'
             or exists (select 1 from activities a
                        where a.related_entity_type='contact' and a.related_entity_id=c.id
                          and a.summary ilike '%agenda cita%'))
         else
           count(distinct mt.id)
         end as citas,
         count(distinct c.id) filter (where s.name ilike '%ganad%') as cierres,
         count(distinct c.id) filter (where s.name ilike '%perdid%') as perdidos,
         coalesce(sum(c.budget) filter (where s.name ilike '%ganad%'),0) as revenue
  from contacts c
  left join pipeline_stages s on s.id=c.stage_id
  left join meetings mt on mt.contact_id=c.id
  where c.organization_id=p_org and (case when p_level='ad' then c.meta_ad_id else c.meta_campaign_id end) is not null
  group by 1
)
select coalesce(jsonb_agg(jsonb_build_object(
  'id', ekey, 'campaign', campaign, 'account', account, 'spend', spend, 'leads', leads,
  'citas', citas, 'cierres', cierres, 'perdidos', perdidos, 'revenue', revenue,
  'roas', case when spend>0 and revenue>0 then round((revenue/spend)::numeric,2) else null end,
  'cpl', case when spend>0 and leads>0 then round((spend/leads)::numeric,0) else null end
) order by (spend is null), spend desc nulls last), '[]'::jsonb)
from (
  select coalesce(ent.ekey, lm.ekey) as ekey,
    coalesce(ent.ad_name, cn.campaign_name, lm.ename, ent.ekey, lm.ekey) as campaign,
    ent.account as account,
    ent.spend as spend,
    coalesce(lm.leads, ent.ad_leads, 0) as leads,
    coalesce(lm.citas,0) as citas, coalesce(lm.cierres,0) as cierres,
    coalesce(lm.perdidos,0) as perdidos, coalesce(lm.revenue,0) as revenue
  from ent
  full join lm on lm.ekey=ent.ekey
  left join cn on cn.campaign_id = coalesce(ent.campaign_id, case when p_level='campaign' then lm.ekey else null end)
  limit 80
) t;
$function$
