-- Robustez del auto-ligado cita↔etapa para CUALQUIER org: bandera explícita
-- is_no_show en la etapa (se marca en el editor de etapas del pipeline). El
-- trigger usa esta bandera O un heurístico de nombre ampliado como respaldo, así
-- funciona sin importar cómo llame cada cliente su etapa de "no asistió".
alter table public.pipeline_stages add column if not exists is_no_show boolean not null default false;

create or replace function public.sync_meeting_status_from_stage()
returns trigger language plpgsql security definer set search_path to 'public'
as $fn$
declare v_name text; v_is_won boolean; v_is_no_show boolean; v_target text;
begin
  if NEW.stage_id is null or NEW.stage_id is not distinct from OLD.stage_id then
    return NEW;
  end if;
  select name, is_won, coalesce(is_no_show,false)
    into v_name, v_is_won, v_is_no_show
  from public.pipeline_stages where id = NEW.stage_id;
  if v_is_no_show
     or v_name ilike '%no asist%' or v_name ilike '%no show%' or v_name ilike '%no-show%'
     or v_name ilike '%ausent%' or v_name ilike '%inasist%' or v_name ilike '%no vino%'
     or v_name ilike '%no lleg%' or v_name ilike '%no acud%' or v_name ilike '%no se present%'
     or v_name ilike '%no present%' or v_name ilike '%missed%' or v_name ilike '%did not show%'
     or v_name ilike '%didn%show%' or v_name ilike '%no attend%' then
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
