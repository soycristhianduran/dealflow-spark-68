-- ════════════════════════════════════════════════════════════════════════════
-- Allow reactivating a won/lost lead back to "active".
-- Previously, setting lead_status='active' while the lead was still on the
-- Ganado/Perdido stage caused enforce_won_rules() to revert it to 'won'/'lost'
-- (stage was still a won/lost stage). Now, reactivation MOVES the lead back to
-- the pipeline's first stage so status and stage stay consistent.
-- Stage→status sync now only fires when the STAGE itself changes.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.enforce_won_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_is_won  boolean;
  v_is_lost boolean;
  v_won_stage uuid;
  v_first_stage uuid;
begin
  select is_won, is_lost into v_is_won, v_is_lost
    from public.pipeline_stages where id = new.stage_id;

  -- Reactivating a won/lost lead → move it back to the first stage.
  if new.lead_status = 'active'
     and old.lead_status is distinct from 'active'
     and new.stage_id is not distinct from old.stage_id
     and (v_is_won is true or v_is_lost is true) then
    select id into v_first_stage
      from public.pipeline_stages
     where pipeline_id = new.pipeline_id and is_first
     order by "order" asc limit 1;
    if v_first_stage is not null then
      new.stage_id := v_first_stage;
    end if;
    return new;  -- reactivation done; skip won/lost enforcement
  end if;

  -- Moving INTO a won/lost stage (stage actually changed) syncs lead_status.
  if v_is_won is true and new.stage_id is distinct from old.stage_id then
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
