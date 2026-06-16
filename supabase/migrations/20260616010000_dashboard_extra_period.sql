CREATE OR REPLACE FUNCTION public.dashboard_extra(
  p_org uuid, p_vendor uuid DEFAULT NULL::uuid,
  p_start timestamptz DEFAULT NULL, p_end timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  result jsonb;
  v_start timestamptz := coalesce(p_start, now() - interval '30 days');
  v_end   timestamptz := coalesce(p_end, now());
begin
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
        group by c.setter_id
      ) t
    ),
    'leads', (
      select jsonb_build_object(
        'today',  count(*) filter (where created_at >= date_trunc('day', now())),
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
        select date_trunc('day', created_at)::date d, count(*) n
        from contacts
        where organization_id = p_org and (p_vendor is null or owner_id = p_vendor)
          and created_at >= v_start and created_at < v_end
        group by 1
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
          (select count(*) from meetings m where m.advisor_id = c.owner_id and m.organization_id = p_org and m.created_at >= v_start and m.created_at < v_end) citas,
          count(*) filter (where s.name ilike '%ganad%') cierres,
          count(*) filter (where s.name ilike '%perdid%') perdidos,
          coalesce(sum(c.budget) filter (where s.name ilike '%ganad%'), 0) revenue
        from contacts c
        left join pipeline_stages s on s.id = c.stage_id
        where c.organization_id = p_org and c.owner_id is not null
          and c.created_at >= v_start and c.created_at < v_end
        group by c.owner_id order by count(*) desc limit 10
      ) v
    )
  );
  return result;
end; $function$;
