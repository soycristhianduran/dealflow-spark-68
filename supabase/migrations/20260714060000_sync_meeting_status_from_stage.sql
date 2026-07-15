-- Auto-ligado (SaaS-wide) del estado de la cita a la etapa del pipeline.
-- Al mover un lead a una etapa de "no asiste" -> su última cita pasada sin marcar
-- queda 'no_show'; a una etapa ganada -> 'completed'. Nunca pisa una marca manual
-- (solo toca citas 'scheduled' ya pasadas). El resto de estados queda manual.
create or replace function public.sync_meeting_status_from_stage()
returns trigger language plpgsql security definer set search_path to 'public'
as $fn$
declare v_name text; v_is_won boolean; v_target text;
begin
  if NEW.stage_id is null or NEW.stage_id is not distinct from OLD.stage_id then
    return NEW;
  end if;
  select name, is_won into v_name, v_is_won from public.pipeline_stages where id = NEW.stage_id;
  if v_name ilike '%no asist%' or v_name ilike '%no show%' or v_name ilike '%no-show%' or v_name ilike '%ausent%' then
    v_target := 'no_show';
  elsif coalesce(v_is_won, false) then
    v_target := 'completed';
  else
    v_target := null;
  end if;
  if v_target is not null then
    update public.meetings set status = v_target
    where id = (
      select id from public.meetings
      where contact_id = NEW.id and organization_id = NEW.organization_id
        and status = 'scheduled' and start_at <= now()
      order by start_at desc limit 1
    );
  end if;
  return NEW;
end $fn$;

drop trigger if exists trg_sync_meeting_status on public.contacts;
create trigger trg_sync_meeting_status
  after update of stage_id on public.contacts
  for each row execute function public.sync_meeting_status_from_stage();
