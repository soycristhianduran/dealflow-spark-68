-- Enforce: a lead can only be marked WON if (a) it's in a won-named stage AND
-- (b) it has a closing budget > 0. Works for EVERY path (pipeline, ficha, bulk,
-- API, agent) — UI dialogs just make it smooth.
create or replace function public.enforce_won_rules()
returns trigger language plpgsql security definer set search_path=public as $$
declare won_stage boolean := false;
begin
  if new.stage_id is not null then
    select (name ~* 'ganad|won') into won_stage from pipeline_stages where id = new.stage_id;
  end if;

  -- Moving INTO a won stage → require budget, auto-set status to won.
  if coalesce(won_stage,false) and new.stage_id is distinct from old.stage_id then
    if new.budget is null or new.budget <= 0 then
      raise exception 'WON_BUDGET_REQUIRED' using message = 'Registra el presupuesto de cierre para marcar el lead como ganado.';
    end if;
    new.lead_status := 'won';
  end if;

  -- Setting status to won directly → must be in a won stage AND have budget.
  if new.lead_status = 'won' and old.lead_status is distinct from 'won' then
    if not coalesce(won_stage,false) then
      raise exception 'WON_STAGE_REQUIRED' using message = 'Para marcar como ganado, mueve el lead a una etapa de cierre ganado.';
    end if;
    if new.budget is null or new.budget <= 0 then
      raise exception 'WON_BUDGET_REQUIRED' using message = 'Registra el presupuesto de cierre para marcar el lead como ganado.';
    end if;
  end if;

  return new;
end; $$;

drop trigger if exists trg_enforce_won on public.contacts;
create trigger trg_enforce_won before update on public.contacts
  for each row execute function public.enforce_won_rules();
