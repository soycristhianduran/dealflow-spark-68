-- Seguridad (aislamiento entre organizaciones): guardas de membresía en las
-- funciones SECURITY DEFINER de lectura/mutación por-org que usa el frontend.
-- Cada una ahora exige public.is_org_member(p_org) (para un miembro no cambia
-- nada; un no-miembro recibe vacío). Definiciones finales tal como quedaron en
-- producción (get_org_members y dashboard_extra ya se blindaron aquí; las de
-- dashboards envuelven su lógica original intacta en un CASE WHEN is_org_member).

CREATE OR REPLACE FUNCTION public.dashboard_ads_accounts(p_org uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select case when public.is_org_member(p_org)
  then (

with acct as (
  select ad_account_id, sum(coalesce(spend,0)) spend, sum(coalesce(leads,0)) ad_leads
  from meta_ads where organization_id=p_org and ad_account_id is not null
  group by ad_account_id
),
camp2acct as (
  select distinct campaign_id, ad_account_id from meta_ads
  where organization_id=p_org and campaign_id is not null and ad_account_id is not null
),
lm as (
  select ca.ad_account_id,
    count(distinct c.id) leads,
    count(distinct mt.id) citas,
    count(distinct c.id) filter (where s.name ilike '%ganad%') cierres,
    coalesce(sum(c.budget) filter (where s.name ilike '%ganad%'),0) revenue
  from contacts c
  join camp2acct ca on ca.campaign_id=c.meta_campaign_id
  left join pipeline_stages s on s.id=c.stage_id
  left join meetings mt on mt.contact_id=c.id
  where c.organization_id=p_org and c.meta_campaign_id is not null
  group by ca.ad_account_id
),
nm as (select ad_account_id, name from meta_org_ad_accounts where organization_id=p_org)
select coalesce(jsonb_agg(jsonb_build_object(
  'account', acct.ad_account_id,
  'name', coalesce(nm.name, acct.ad_account_id),
  'spend', acct.spend,
  'leads', coalesce(lm.leads, acct.ad_leads, 0),
  'citas', coalesce(lm.citas,0),
  'cierres', coalesce(lm.cierres,0),
  'revenue', coalesce(lm.revenue,0),
  'roas', case when acct.spend>0 and lm.revenue>0 then round((lm.revenue/acct.spend)::numeric,2) else null end
) order by acct.spend desc nulls last), '[]'::jsonb)
from acct
left join lm on lm.ad_account_id=acct.ad_account_id
left join nm on nm.ad_account_id=acct.ad_account_id
  ) else '[]'::jsonb end
$function$
;

CREATE OR REPLACE FUNCTION public.dashboard_ads_roas(p_org uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select case when public.is_org_member(p_org)
  then (

  with cfg as (
    select coalesce(nullif(vendor_conversion_base,''),'leads') base from organizations where id = p_org
  ),
  mc as (
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
      -- Citas: por defecto (base 'appointments') cuenta los leads atribuidos que
      -- llegaron a la etapa de cita (o pasaron por ella según el timeline); en
      -- 'leads' mantiene el conteo por reuniones (histórico).
      case when (select base from cfg) = 'appointments' then
        count(distinct lc.id) filter (where
          s.name ilike '%agenda cita%' or s.name ilike '%cita confirmada%'
          or s.name ilike '%no asiste%' or s.name ilike '%ganad%'
          or exists (select 1 from activities a
                     where a.related_entity_type='contact' and a.related_entity_id=lc.id
                       and a.summary ilike '%agenda cita%'))
      else
        count(distinct m.id)
      end citas,
      count(distinct lc.id) filter (where s.name ilike '%ganad%') cierres,
      coalesce(sum(lc.budget) filter (where s.name ilike '%ganad%'), 0) revenue
    from leadcamp lc
    left join mc on mc.campaign_id = lc.meta_campaign_id
    left join pipeline_stages s on s.id = lc.stage_id
    left join meetings m on m.contact_id = lc.id
    group by lc.meta_campaign_id
    limit 30
  ) t
  ) else '[]'::jsonb end
$function$
;

CREATE OR REPLACE FUNCTION public.dashboard_ads_roas(p_org uuid, p_level text DEFAULT 'campaign'::text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select case when public.is_org_member(p_org)
  then (

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
) t
  ) else '[]'::jsonb end
$function$
;

CREATE OR REPLACE FUNCTION public.dashboard_extra(p_org uuid, p_vendor uuid DEFAULT NULL::uuid, p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result jsonb;
  v_start timestamptz := coalesce(p_start, now() - interval '30 days');
  v_end   timestamptz := coalesce(p_end, now());
  -- Base del % de conversión / conteo de citas por vendedor.
  -- 'appointments' => citas = leads que pasaron por la etapa de cita.
  -- 'leads' (default) => citas = filas de reuniones (comportamiento histórico).
  v_conv_base text := (select coalesce(nullif(vendor_conversion_base,''),'leads') from organizations where id=p_org);
begin
  -- Aislamiento entre organizaciones: solo un miembro puede ver este dashboard.
  if not public.is_org_member(p_org) then return '[]'::jsonb; end if;
  result := jsonb_build_object(
    'setters', (
      select coalesce(jsonb_agg(jsonb_build_object('setter_id', setter_id, 'leads', leads, 'citas', citas, 'ganados', ganados) order by citas desc), '[]'::jsonb)
      from (
        select c.setter_id,
          count(distinct c.id) leads,
          (select count(*) from meetings m join contacts cc on cc.id = m.contact_id where cc.setter_id = c.setter_id and cc.organization_id = p_org and m.created_at >= v_start and m.created_at < v_end) citas,
          count(*) filter (where s.name ilike '%ganad%') ganados
        from contacts c
        left join pipeline_stages s on s.id = c.stage_id
        where c.organization_id = p_org and c.setter_id is not null
          and c.created_at >= v_start and c.created_at < v_end
          and not exists (
            select 1 from organization_members om
            where om.organization_id = p_org and om.user_id = c.setter_id and om.role = 'gestor')
        group by c.setter_id
      ) t
    ),
    'leads', (
      select jsonb_build_object(
        'today',  count(*) filter (where created_at >= date_trunc('day', now() at time zone (select coalesce(nullif(timezone,''),'America/Bogota') from organizations where id=p_org)) at time zone (select coalesce(nullif(timezone,''),'America/Bogota') from organizations where id=p_org)),
        'week',   count(*) filter (where created_at >= now() - interval '7 days'),
        'month',  count(*) filter (where created_at >= now() - interval '30 days'),
        'total',  count(*),
        'period', count(*) filter (where created_at >= v_start and created_at < v_end)
      )
      from contacts
      where organization_id = p_org and (p_vendor is null or owner_id = p_vendor)
    ),
    'trend', (
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d), '[]'::jsonb)
      from (
        select gs::date d, coalesce(c.cnt, 0) n
        from generate_series(v_start::date, (v_end - interval '1 microsecond')::date, interval '1 day') gs
        left join (
          select date_trunc('day', created_at)::date dd, count(*) cnt
          from contacts
          where organization_id = p_org and (p_vendor is null or owner_id = p_vendor)
            and created_at >= v_start and created_at < v_end
          group by 1
        ) c on c.dd = gs::date
      ) t
    ),
    'sources', (
      select coalesce(jsonb_agg(jsonb_build_object('source', coalesce(nullif(source,''),'(sin fuente)'), 'n', n) order by n desc), '[]'::jsonb)
      from (
        select source, count(*) n
        from contacts
        where organization_id = p_org and (p_vendor is null or owner_id = p_vendor)
          and created_at >= v_start and created_at < v_end
        group by source order by count(*) desc limit 8
      ) s
    ),
    'agent', (
      select jsonb_build_object(
        'sessions_month', coalesce(count(*),0),
        'escalations_month', coalesce(count(*) filter (where was_escalated),0)
      )
      from ai_agent_sessions
      where organization_id = p_org and started_at >= v_start and started_at < v_end
    ),
    'funnels', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'pipeline_id', p.id,
        'pipeline_name', p.name,
        'stages', (
          select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'count', coalesce(c.cnt,0), 'color', s.color) order by s."order"), '[]'::jsonb)
          from pipeline_stages s
          left join (
            select stage_id, count(*) cnt from contacts
            where organization_id=p_org and (p_vendor is null or owner_id=p_vendor)
              and created_at >= v_start and created_at < v_end
            group by stage_id
          ) c on c.stage_id = s.id
          where s.pipeline_id = p.id
        )
      ) order by p.created_at), '[]'::jsonb)
      from pipelines p where p.organization_id = p_org
    ),
    'vendors', (
      select coalesce(jsonb_agg(jsonb_build_object('owner_id', owner_id, 'leads', leads, 'citas', citas, 'cierres', cierres, 'perdidos', perdidos, 'revenue', revenue) order by leads desc), '[]'::jsonb)
      from (
        select c.owner_id,
          count(*) leads,
          case when v_conv_base = 'appointments' then
            -- Leads (del mismo cohorte creado en el periodo) que llegaron a la
            -- etapa de cita: por etapa actual (cita o posterior) o por el timeline
            -- de cambios de etapa hacia "Agenda cita".
            (select count(distinct cc.id)
               from contacts cc
               left join pipeline_stages ss on ss.id = cc.stage_id
               where cc.organization_id = p_org and cc.owner_id = c.owner_id
                 and cc.created_at >= v_start and cc.created_at < v_end
                 and (
                   ss.name ilike '%agenda cita%' or ss.name ilike '%cita confirmada%'
                   or ss.name ilike '%no asiste%' or ss.name ilike '%ganad%'
                   or exists (select 1 from activities a
                              where a.related_entity_type='contact' and a.related_entity_id=cc.id
                                and a.summary ilike '%agenda cita%')
                 ))
          else
            (select count(*) from meetings m where m.advisor_id = c.owner_id and m.organization_id = p_org and m.created_at >= v_start and m.created_at < v_end)
          end citas,
          count(*) filter (where s.name ilike '%ganad%') cierres,
          count(*) filter (where s.name ilike '%perdid%') perdidos,
          coalesce(sum(c.budget) filter (where s.name ilike '%ganad%'), 0) revenue
        from contacts c
        left join pipeline_stages s on s.id = c.stage_id
        where c.organization_id = p_org and c.owner_id is not null
          and c.created_at >= v_start and c.created_at < v_end
          and not exists (
            select 1 from organization_members om
            where om.organization_id = p_org and om.user_id = c.owner_id and om.role = 'gestor')
        group by c.owner_id order by count(*) desc limit 10
      ) v
    )
  );
  return result;
end; $function$
;

CREATE OR REPLACE FUNCTION public.dashboard_pipeline(p_org uuid, p_vendor uuid DEFAULT NULL::uuid, p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select case when public.is_org_member(p_org)
  then (

  WITH f AS (
    SELECT stage_id, budget, budget_currency
    FROM contacts
    WHERE organization_id = p_org AND pipeline_id IS NOT NULL AND lead_status = 'active'
      AND (p_vendor IS NULL OR owner_id = p_vendor)
      AND (p_start IS NULL OR created_at >= p_start)
      AND (p_end IS NULL OR created_at < p_end)
  )
  SELECT jsonb_build_object(
    'count', (SELECT count(*) FROM f),
    'value', (SELECT coalesce(sum(budget), 0) FROM f),
    'currency', (SELECT budget_currency FROM f WHERE budget_currency IS NOT NULL GROUP BY budget_currency ORDER BY count(*) DESC LIMIT 1),
    'stages', (SELECT coalesce(jsonb_object_agg(stage_id, jsonb_build_object('count', cnt, 'value', val)), '{}'::jsonb)
               FROM (SELECT stage_id, count(*) cnt, coalesce(sum(budget),0) val FROM f WHERE stage_id IS NOT NULL GROUP BY stage_id) s)
  )
  ) else '[]'::jsonb end
$function$
;

CREATE OR REPLACE FUNCTION public.merge_contacts(p_primary_id uuid, p_secondary_id uuid, p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_primary   contacts%ROWTYPE;
  v_secondary contacts%ROWTYPE;
BEGIN
  -- Aislamiento entre organizaciones: solo un miembro de la org puede fusionar
  -- sus contactos (evita que un usuario de otra org manipule datos ajenos).
  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'merge_contacts: no autorizado para esta organización';
  END IF;

  -- 1. Validate inputs
  IF p_primary_id = p_secondary_id THEN
    RAISE EXCEPTION 'merge_contacts: primary and secondary IDs must be different';
  END IF;

  SELECT * INTO v_primary
  FROM contacts
  WHERE id = p_primary_id AND organization_id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_contacts: primary contact % not found in org %', p_primary_id, p_org_id;
  END IF;

  SELECT * INTO v_secondary
  FROM contacts
  WHERE id = p_secondary_id AND organization_id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_contacts: secondary contact % not found in org %', p_secondary_id, p_org_id;
  END IF;

  -- 2. Reassign related records: secondary → primary

  UPDATE whatsapp_messages   SET contact_id = p_primary_id WHERE contact_id = p_secondary_id;
  UPDATE call_logs            SET contact_id = p_primary_id WHERE contact_id = p_secondary_id;
  UPDATE tasks                SET contact_id = p_primary_id WHERE contact_id = p_secondary_id;
  UPDATE meetings             SET contact_id = p_primary_id WHERE contact_id = p_secondary_id;
  UPDATE deals                SET contact_id = p_primary_id WHERE contact_id = p_secondary_id;
  UPDATE instagram_conversations SET contact_id = p_primary_id WHERE contact_id = p_secondary_id;

  UPDATE activities
  SET related_entity_id = p_primary_id
  WHERE related_entity_id = p_secondary_id
    AND related_entity_type = 'contact';

  -- contact_ai_analyses: if primary already has one, drop secondary's to avoid unique violation
  DELETE FROM contact_ai_analyses
  WHERE contact_id = p_secondary_id
    AND EXISTS (SELECT 1 FROM contact_ai_analyses WHERE contact_id = p_primary_id);

  UPDATE contact_ai_analyses
  SET contact_id = p_primary_id
  WHERE contact_id = p_secondary_id;

  -- 3. Merge fields on the primary contact row
  UPDATE contacts
  SET
    tags          = ARRAY(SELECT DISTINCT unnest(
                      COALESCE(v_primary.tags, '{}') || COALESCE(v_secondary.tags, '{}')
                    )),
    custom_fields = COALESCE(v_secondary.custom_fields, '{}'::jsonb)
                    || COALESCE(v_primary.custom_fields, '{}'::jsonb),
    first_name    = COALESCE(v_primary.first_name,    v_secondary.first_name),
    last_name     = COALESCE(v_primary.last_name,     v_secondary.last_name),
    full_name     = COALESCE(NULLIF(TRIM(COALESCE(v_primary.full_name,'')), ''), v_secondary.full_name),
    primary_email = COALESCE(v_primary.primary_email, v_secondary.primary_email),
    primary_phone = COALESCE(v_primary.primary_phone, v_secondary.primary_phone),
    company_name  = COALESCE(v_primary.company_name,  v_secondary.company_name),
    city          = COALESCE(v_primary.city,          v_secondary.city),
    country       = COALESCE(v_primary.country,       v_secondary.country),
    score         = GREATEST(COALESCE(v_primary.score, 0), COALESCE(v_secondary.score, 0)),
    -- Keep the most recent creation date so the contact sorts at its latest position
    created_at    = GREATEST(v_primary.created_at, v_secondary.created_at)
  WHERE id = p_primary_id;

  -- 4. Log a merge activity on the primary contact's timeline
  INSERT INTO activities (
    organization_id,
    related_entity_id,
    related_entity_type,
    event_type,
    event_source,
    summary
  ) VALUES (
    p_org_id,
    p_primary_id,
    'contact',
    'system',
    'merge',
    '🔀 Contacto fusionado — origen secundario: ' ||
      COALESCE(v_secondary.source::text, 'desconocido') ||
      ', tel: ' || COALESCE(v_secondary.primary_phone, '-')
  );

  -- 5. Delete the secondary contact
  DELETE FROM contacts WHERE id = p_secondary_id;

  -- 6. Recalculate score
  PERFORM recalculate_contact_score(p_primary_id);

  RETURN jsonb_build_object('success', true, 'primary_id', p_primary_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.whatsapp_campaign_stats(p_org uuid)
 RETURNS TABLE(campaign_id uuid, sent integer, delivered integer, read_c integer, failed integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select campaign_id,
    count(*) filter (where status in ('sent','delivered','read'))::int,
    count(*) filter (where status in ('delivered','read'))::int,
    count(*) filter (where status = 'read')::int,
    count(*) filter (where status = 'failed')::int
  from whatsapp_sends
  where organization_id = p_org
    and public.is_org_member(p_org)
  group by campaign_id;
$function$
;
