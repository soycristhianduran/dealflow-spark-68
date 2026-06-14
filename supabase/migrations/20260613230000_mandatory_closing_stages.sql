-- ════════════════════════════════════════════════════════════════════════════
-- Mandatory closing stages (SaaS-wide)
-- Every pipeline ALWAYS has a "Ganado" (won) and "Perdido" (lost) stage. These
-- are flagged as system stages and cannot be deleted. When a lead is marked won
-- it is automatically moved into the pipeline's won stage (budget still required).
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Flag columns -------------------------------------------------------------
alter table public.pipeline_stages
  add column if not exists is_won    boolean not null default false,
  add column if not exists is_lost   boolean not null default false,
  add column if not exists is_system boolean not null default false;

-- 2. Backfill flags from common won/lost names --------------------------------
update public.pipeline_stages set is_won = true
  where is_won = false and name ~* 'ganad|won|cerrado ganado|closed won';
update public.pipeline_stages set is_lost = true
  where is_lost = false and name ~* 'perdid|lost|cerrado perdido|closed lost';

-- 3. Ensure a pipeline has Ganado + Perdido system stages ---------------------
create or replace function public.ensure_pipeline_closing_stages(p_pipeline uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.pipelines where id = p_pipeline;

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

-- 4. Backfill every existing pipeline -----------------------------------------
do $$
declare r record;
begin
  for r in select id from public.pipelines loop
    perform public.ensure_pipeline_closing_stages(r.id);
  end loop;
end $$;

-- 5. Auto-create closing stages on every new pipeline -------------------------
create or replace function public.tg_pipeline_closing_stages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_pipeline_closing_stages(new.id);
  return new;
end;
$$;

drop trigger if exists trg_pipeline_closing_stages on public.pipelines;
create trigger trg_pipeline_closing_stages
  after insert on public.pipelines
  for each row execute function public.tg_pipeline_closing_stages();

-- 6. Block deletion of system stages (allow FK cascade on pipeline delete) -----
create or replace function public.tg_block_system_stage_delete()
returns trigger
language plpgsql
as $$
begin
  -- Allow deletion when the parent pipeline is itself being deleted (cascade):
  -- during cascade the parent row is no longer visible.
  if old.is_system and exists (select 1 from public.pipelines where id = old.pipeline_id) then
    raise exception 'SYSTEM_STAGE_DELETE: Las etapas de cierre (Ganado/Perdido) no se pueden eliminar.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_block_system_stage_delete on public.pipeline_stages;
create trigger trg_block_system_stage_delete
  before delete on public.pipeline_stages
  for each row execute function public.tg_block_system_stage_delete();

-- 7. Update won enforcement: require budget, AUTO-MOVE into the won stage ------
create or replace function public.enforce_won_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_is_won  boolean;
  v_is_lost boolean;
  v_won_stage uuid;
begin
  select is_won, is_lost into v_is_won, v_is_lost
    from public.pipeline_stages where id = new.stage_id;

  -- Moving INTO a won/lost stage syncs lead_status accordingly.
  if v_is_won is true and (new.stage_id is distinct from old.stage_id or new.lead_status is distinct from old.lead_status) then
    new.lead_status := 'won';
  elsif v_is_lost is true and new.stage_id is distinct from old.stage_id then
    new.lead_status := 'lost';
  end if;

  -- Marking a lead as WON requires a closing budget and forces the won stage.
  if new.lead_status = 'won'
     and (old.lead_status is distinct from 'won' or new.budget is distinct from old.budget or new.stage_id is distinct from old.stage_id) then
    if new.budget is null or new.budget <= 0 then
      raise exception 'WON_BUDGET_REQUIRED: Registra el presupuesto de cierre para marcar como ganado.'
        using errcode = 'P0001';
    end if;
    -- Auto-move to the pipeline's won stage if not already on one.
    if not (v_is_won is true) and new.pipeline_id is not null then
      select id into v_won_stage
        from public.pipeline_stages
       where pipeline_id = new.pipeline_id and is_won
       order by "order" asc limit 1;
      if v_won_stage is not null then
        new.stage_id := v_won_stage;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_won on public.contacts;
create trigger trg_enforce_won
  before update on public.contacts
  for each row execute function public.enforce_won_rules();
