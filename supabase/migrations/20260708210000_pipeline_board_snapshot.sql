-- Pipeline board fast-paint (applied live 2026-07-08).
-- Post-migration boards hold 10k+ contacts; shipping every row before first
-- paint took seconds. This snapshot returns, in ONE round-trip, the top-N
-- cards per stage plus exact per-stage count/sum aggregates, so the kanban
-- paints instantly while the full set streams in the background.
create index if not exists idx_contacts_pipeline_created
  on public.contacts (pipeline_id, created_at desc);

create or replace function public.pipeline_board_snapshot(
  p_pipeline uuid, p_limit int default 50, p_owner uuid default null, p_setter uuid default null
) returns json
language plpgsql stable security definer set search_path to 'public' as $fn$
declare v_org uuid;
begin
  select organization_id into v_org from pipelines where id = p_pipeline;
  if v_org is null or not is_org_member(v_org) then
    raise exception 'forbidden';
  end if;
  return json_build_object(
    'aggregates', (
      select coalesce(json_agg(a), '[]'::json) from (
        select stage_id, count(*) as n, coalesce(sum(budget),0) as total_budget
        from contacts
        where pipeline_id = p_pipeline
          and (p_owner is null or owner_id = p_owner)
          and (p_setter is null or owner_id = p_setter or setter_id = p_setter)
        group by stage_id) a),
    'top', (
      select coalesce(json_agg(t), '[]'::json) from (
        select c.* from pipeline_stages s
        cross join lateral (
          select c2.id, c2.full_name, c2.primary_phone, c2.stage_id, c2.pipeline_id, c2.budget, c2.budget_currency, c2.expected_close_date, c2.lead_status, c2.owner_id, c2.source, c2.tags, c2.created_at
          from contacts c2
          where c2.pipeline_id = p_pipeline and c2.stage_id = s.id
            and (p_owner is null or c2.owner_id = p_owner)
            and (p_setter is null or c2.owner_id = p_setter or c2.setter_id = p_setter)
          order by c2.created_at desc limit p_limit) c
        where s.pipeline_id = p_pipeline) t)
  );
end $fn$;

grant execute on function public.pipeline_board_snapshot(uuid,int,uuid,uuid) to authenticated;
