create or replace function public.dashboard_extra(p_org uuid, p_vendor uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
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
    'vendors', (
      select coalesce(jsonb_agg(jsonb_build_object('owner_id', owner_id, 'leads', leads, 'citas', citas) order by leads desc), '[]'::jsonb)
      from (
        select c.owner_id,
          count(*) leads,
          (select count(*) from meetings m where m.advisor_id = c.owner_id and m.organization_id = p_org) citas
        from contacts c
        where c.organization_id = p_org and c.owner_id is not null
        group by c.owner_id order by count(*) desc limit 10
      ) v
    )
  );
  return result;
end; $$;
grant execute on function public.dashboard_extra(uuid,uuid) to authenticated, service_role;
