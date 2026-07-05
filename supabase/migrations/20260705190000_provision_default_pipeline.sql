-- New orgs should be born with a default pipeline so the board is never empty
-- (avoids the frontend having to auto-create it, which could loop). The
-- pipeline insert trigger already seeds the Nuevo contacto / Ganado / Perdido
-- system stages; we add three editable middle stages to match the app default.
create or replace function public.provision_new_user(p_uid uuid, p_email text, p_meta jsonb)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_company text; v_full_name text; v_org_name text; v_slug text; v_slug_try text;
  v_attempt integer := 0; v_org_id uuid; v_joined boolean := false; v_pipe_id uuid; rec record;
begin
  if exists (select 1 from public.organization_members where user_id = p_uid) then return; end if;

  if p_email is not null then
    for rec in select id, organization_id, role from public.organization_invitations
       where lower(email) = lower(p_email) and accepted_at is null and expires_at > now()
    loop
      insert into public.organization_members (user_id, organization_id, role)
      values (p_uid, rec.organization_id, rec.role) on conflict (organization_id, user_id) do nothing;
      update public.organization_invitations set accepted_at = now() where id = rec.id;
      v_joined := true;
    end loop;
  end if;
  if v_joined then return; end if;

  if p_email is null or (p_meta ->> 'invite_token') is not null then return; end if;

  v_company := nullif(trim(coalesce(p_meta ->> 'company_name', '')), '');
  v_full_name := nullif(trim(coalesce(p_meta ->> 'full_name', '')), '');
  v_org_name := coalesce(v_company, case when v_full_name is not null then v_full_name || ' Workspace' else 'Workspace' end);
  v_slug := public.slugify(v_org_name);
  if v_slug is null or length(v_slug) = 0 then v_slug := 'workspace'; end if;
  v_slug_try := v_slug;
  loop
    exit when not exists (select 1 from public.organizations where slug = v_slug_try);
    v_attempt := v_attempt + 1;
    if v_attempt > 10 then v_slug_try := v_slug || '-' || substring(p_uid::text, 1, 8); exit; end if;
    v_slug_try := v_slug || '-' || substring(p_uid::text, 1, 4 + v_attempt);
  end loop;

  insert into public.organizations (name, slug) values (v_org_name, v_slug_try) returning id into v_org_id;
  insert into public.organization_members (user_id, organization_id, role) values (p_uid, v_org_id, 'owner');

  -- Default pipeline (system stages auto-seeded by the pipeline insert trigger)
  insert into public.pipelines (name, organization_id) values ('Pipeline principal', v_org_id) returning id into v_pipe_id;
  insert into public.pipeline_stages (pipeline_id, organization_id, name, color, probability, "order") values
    (v_pipe_id, v_org_id, 'Contactado', '#60a5fa', 20, 1),
    (v_pipe_id, v_org_id, 'Calificado', '#818cf8', 45, 2),
    (v_pipe_id, v_org_id, 'Propuesta enviada', '#f59e0b', 70, 3);
exception when others then
  raise warning 'provision_new_user pipeline seed failed for %: %', p_uid, sqlerrm;
end;
$function$;
