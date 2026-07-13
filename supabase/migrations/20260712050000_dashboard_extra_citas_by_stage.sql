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
