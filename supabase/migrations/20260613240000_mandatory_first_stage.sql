-- ════════════════════════════════════════════════════════════════════════════
-- Mandatory first stage "Nuevo contacto" (SaaS-wide)
-- Every pipeline ALWAYS starts with an undeletable system stage. Combined with
-- the won/lost system stages, the fixed skeleton of every pipeline is:
--   [Nuevo contacto] · …editable stages… · [Ganado] · [Perdido]
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Flag column --------------------------------------------------------------
alter table public.pipeline_stages
  add column if not exists is_first boolean not null default false;

-- 2. Extend the ensure-function to also guarantee the first stage -------------
create or replace function public.ensure_pipeline_closing_stages(p_pipeline uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_first uuid;
begin
  select organization_id into v_org from public.pipelines where id = p_pipeline;

  -- FIRST: promote the lowest-order non-closing stage, else create "Nuevo contacto"
  if not exists (select 1 from public.pipeline_stages where pipeline_id = p_pipeline and is_first) then
    select id into v_first
      from public.pipeline_stages
     where pipeline_id = p_pipeline and not is_won and not is_lost
     order by "order" asc, created_at asc
     limit 1;
    if v_first is not null then
      update public.pipeline_stages set is_first = true, is_system = true where id = v_first;
    else
      insert into public.pipeline_stages (pipeline_id, organization_id, name, color, probability, "order", is_first, is_system)
      values (p_pipeline, v_org, 'Nuevo contacto', '#94a3b8', 5, 0, true, true);
    end if;
  else
    update public.pipeline_stages set is_system = true where pipeline_id = p_pipeline and is_first and not is_system;
  end if;

  -- WON: promote an existing won-named stage, else create "Ganado"
  if not exists (select 1 from public.pipeline_stages where pipeline_id = p_pipeline and is_won) then
    update public.pipeline_stages
       set is_won = true, is_system = true
     where pipeline_id = p_pipeline and name ~* 'ganad|won|cerrado ganado|closed won';
    if not found then
      insert into public.pipeline_stages (pipeline_id, organization_id, name, color, probability, "order", is_won, is_system)
      values (p_pipeline, v_org, 'Ganado', '#22c55e', 100, 9998, true, true);
    end if;
  else
    update public.pipeline_stages set is_system = true where pipeline_id = p_pipeline and is_won and not is_system;
  end if;

  -- LOST: promote an existing lost-named stage, else create "Perdido"
  if not exists (select 1 from public.pipeline_stages where pipeline_id = p_pipeline and is_lost) then
    update public.pipeline_stages
       set is_lost = true, is_system = true
     where pipeline_id = p_pipeline and name ~* 'perdid|lost|cerrado perdido|closed lost';
    if not found then
      insert into public.pipeline_stages (pipeline_id, organization_id, name, color, probability, "order", is_lost, is_system)
      values (p_pipeline, v_org, 'Perdido', '#ef4444', 0, 9999, true, true);
    end if;
  else
    update public.pipeline_stages set is_system = true where pipeline_id = p_pipeline and is_lost and not is_system;
  end if;
end;
$$;

-- 3. Backfill every existing pipeline -----------------------------------------
do $$
declare r record;
begin
  for r in select id from public.pipelines loop
    perform public.ensure_pipeline_closing_stages(r.id);
  end loop;
end $$;
