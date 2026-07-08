-- Platform admin: assign the non-billable "gestor" role by EMAIL.
-- Wraps platform_assign_gestor (which takes a user_id) with an email lookup so
-- the /admin panel can assign gestores without knowing internal ids. Applied
-- live on 2026-07-07; recorded here for reproducibility.
create or replace function public.platform_assign_gestor_by_email(p_email text, p_org_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_user uuid;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not_platform_admin' using errcode = 'P0001';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_user is null then
    return 'user_not_found';
  end if;
  insert into public.organization_members (user_id, organization_id, role)
  values (v_user, p_org_id, 'gestor')
  on conflict (user_id, organization_id) do update set role = 'gestor';
  return 'ok';
end;
$fn$;

grant execute on function public.platform_assign_gestor_by_email(text, uuid) to authenticated;
