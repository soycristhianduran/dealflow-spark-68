CREATE OR REPLACE FUNCTION public.dashboard_extra(p_org uuid, p_vendor uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare result jsonb;
begin
  result := jsonb_build_object(
    'leads', (
      select jsonb_build_object(
        'today', count(*) filter (where created_at >= date_trunc('day', now())),
        'week',  count(*) filter (where created_at >= now() - interval '7 days'),
        'month', count(*) filter (where created_at >= now() - interval '30 days'),
        'total', count(*)
      )
      from contacts
      where organization_id = p_org and (p_vendor is null or owner_id = p_vendor)
    ),
    'trend', (
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d), '[]'::jsonb)
      from (
        select date_trunc('day', created_at)::date d, count(*) n
        from contacts
        where organization_id = p_org and (p_vendor is null or owner_id = p_vendor)
          and created_at >= now() - interval '30 days'
        group by 1
      ) t
    ),
    'sources', (
      select coalesce(jsonb_agg(jsonb_build_object('source', coalesce(nullif(source,''),'(sin fuente)'), 'n', n) order by n desc), '[]'::jsonb)
      from (
        select source, count(*) n
        from contacts
        where organization_id = p_org and (p_vendor is null or owner_id = p_vendor)
          and created_at >= now() - interval '30 days'
        group by source order by count(*) desc limit 8
      ) s
    ),
    'agent', (
      select jsonb_build_object(
        'sessions_month', coalesce(count(*),0),
        'escalations_month', coalesce(count(*) filter (where was_escalated),0)
      )
      from ai_agent_sessions
      where organization_id = p_org and started_at >= now() - interval '30 days'
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
          (select count(*) from meetings m where m.advisor_id = c.owner_id and m.organization_id = p_org) citas,
          count(*) filter (where s.name ilike '%ganad%') cierres,
          count(*) filter (where s.name ilike '%perdid%') perdidos,
          coalesce(sum(c.budget) filter (where s.name ilike '%ganad%'), 0) revenue
        from contacts c
        left join pipeline_stages s on s.id = c.stage_id
        where c.organization_id = p_org and c.owner_id is not null
        group by c.owner_id order by count(*) desc limit 10
      ) v
    )
  );
  return result;
end; $function$
