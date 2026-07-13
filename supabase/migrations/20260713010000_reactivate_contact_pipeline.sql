drop function if exists public.reactivate_contact_pipeline(uuid, text, text);
create or replace function public.reactivate_contact_pipeline(p_contact_id uuid, p_source text default 'reactivation', p_detail text default '', p_pipeline_id uuid default null)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid; v_pipeline uuid; v_stage uuid; v_status text; v_stage_name text;
begin
  select organization_id, pipeline_id, lead_status into v_org, v_pipeline, v_status
    from contacts where id = p_contact_id;
  if v_org is null then return false; end if;
  if v_status = 'won' then return false; end if;  -- no reactivar ganados
  select s.name into v_stage_name from pipeline_stages s
    join contacts c on c.stage_id = s.id where c.id = p_contact_id;
  if v_stage_name ilike '%ganad%' then return false; end if;
  -- Pipeline destino: el que se pase (ej. el del formulario), si no el actual del
  -- contacto, si no el primero de la org.
  if p_pipeline_id is not null then v_pipeline := p_pipeline_id; end if;
  if v_pipeline is null then
    select id into v_pipeline from pipelines where organization_id = v_org order by created_at limit 1;
  end if;
  if v_pipeline is null then return false; end if;
  select id into v_stage from pipeline_stages where pipeline_id = v_pipeline order by "order" asc limit 1;
  if v_stage is null then return false; end if;
  update contacts
    set pipeline_id = v_pipeline, stage_id = v_stage, lead_status = 'active',
        last_contact_at = now(), updated_at = now()
    where id = p_contact_id;
  insert into activities(related_entity_type, related_entity_id, event_type, event_source, summary)
    values('contact', p_contact_id, 'note', coalesce(nullif(p_source,''),'reactivation'),
      '🔁 Lead reactivado — volvió a registrarse' || case when coalesce(p_detail,'') <> '' then E'\n' || p_detail else '' end);
  return true;
end; $$;
