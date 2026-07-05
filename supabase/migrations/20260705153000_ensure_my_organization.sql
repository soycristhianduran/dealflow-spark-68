-- Self-heal: if a logged-in user somehow has no organization (provisioning
-- trigger failed, race, etc.), the frontend calls this to fix it on the spot.
create or replace function public.ensure_my_organization()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text;
  v_meta  jsonb;
begin
  if auth.uid() is null then return; end if;
  if exists (select 1 from public.organization_members where user_id = auth.uid()) then
    return;
  end if;
  select email, raw_user_meta_data into v_email, v_meta from auth.users where id = auth.uid();
  insert into public.profiles (user_id, email) values (auth.uid(), v_email)
  on conflict (user_id) do update set email = excluded.email;
  perform public.provision_new_user(auth.uid(), v_email, v_meta);
end;
$$;
grant execute on function public.ensure_my_organization() to authenticated;
