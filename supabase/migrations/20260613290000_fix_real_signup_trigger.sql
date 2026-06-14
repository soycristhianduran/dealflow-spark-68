-- ════════════════════════════════════════════════════════════════════════════
-- Fix the ACTUAL signup trigger.
-- The live trigger on auth.users is `on_auth_user_created_org` →
-- handle_new_user_organization(), which ALWAYS created a personal org and never
-- checked invitations. (Earlier fixes edited handle_new_user(), which is NOT the
-- attached trigger — so invited users kept getting a stray personal org + loop.)
--
-- Now it: creates the profile row, then provisions via provision_new_user()
-- (idempotent: joins a pending invitation by email, else creates the personal org).
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user_organization()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Always ensure a profile row (vendor lists, etc.)
  insert into public.profiles (user_id, email)
  values (NEW.id, NEW.email)
  on conflict (user_id) do update set email = excluded.email;

  -- Join a pending invitation by email, else create the personal workspace.
  if NEW.email is not null then
    perform public.provision_new_user(NEW.id, NEW.email, NEW.raw_user_meta_data);
  end if;

  return NEW;
exception when others then
  raise warning 'handle_new_user_organization failed for user %: %', NEW.id, sqlerrm;
  return NEW;
end;
$function$;

-- Also keep the profile email fresh if the email is set later (OAuth edge case).
create or replace function public.handle_user_email_set()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if NEW.email is not null and (OLD.email is distinct from NEW.email) then
    insert into public.profiles (user_id, email)
    values (NEW.id, NEW.email)
    on conflict (user_id) do update set email = excluded.email;

    perform public.provision_new_user(NEW.id, NEW.email, NEW.raw_user_meta_data);
  end if;
  return NEW;
exception when others then
  raise warning 'handle_user_email_set failed for user %: %', NEW.id, sqlerrm;
  return NEW;
end;
$function$;
