-- ════════════════════════════════════════════════════════════════════════════
-- OAuth-safe user provisioning.
-- For Google/OAuth signups the auth.users row is often inserted with a NULL email
-- and the email is set in a follow-up UPDATE. handle_new_user() ran at INSERT with
-- no email, failed to match the pending invitation, and created a personal org —
-- leaving the invited user as owner of a stray org (and a redirect loop).
--
-- Fix: a shared provision_new_user() that (a) no-ops if the user already has a
-- membership, (b) auto-joins any pending invitation matching the email, else
-- (c) creates the personal workspace. It runs at INSERT (when email present) AND
-- when the email is later set via UPDATE — so OAuth users are provisioned once,
-- correctly, with no duplicate org.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.provision_new_user(p_uid uuid, p_email text, p_meta jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company   text;
  v_full_name text;
  v_org_name  text;
  v_slug      text;
  v_slug_try  text;
  v_attempt   integer := 0;
  v_org_id    uuid;
  v_joined    boolean := false;
  rec         record;
begin
  -- Idempotent: if the user already belongs to an org, do nothing.
  if exists (select 1 from public.organization_members where user_id = p_uid) then
    return;
  end if;

  -- 1. Auto-join any pending invitation matching this user's email.
  if p_email is not null then
    for rec in
      select id, organization_id, role
        from public.organization_invitations
       where lower(email) = lower(p_email)
         and accepted_at is null
         and expires_at > now()
    loop
      insert into public.organization_members (user_id, organization_id, role)
      values (p_uid, rec.organization_id, rec.role)
      on conflict (organization_id, user_id) do nothing;

      update public.organization_invitations set accepted_at = now() where id = rec.id;
      v_joined := true;
    end loop;
  end if;

  if v_joined then
    return;
  end if;

  -- Don't create a personal org yet if we still don't know the email (OAuth pre-email)
  -- or the user explicitly came through an invite link.
  if p_email is null or (p_meta ->> 'invite_token') is not null then
    return;
  end if;

  -- 2. Create the user's personal workspace.
  v_company   := nullif(trim(coalesce(p_meta ->> 'company_name', '')), '');
  v_full_name := nullif(trim(coalesce(p_meta ->> 'full_name', '')), '');

  v_org_name := coalesce(
    v_company,
    case when v_full_name is not null then v_full_name || ' Workspace' else 'Workspace' end
  );

  v_slug := public.slugify(v_org_name);
  if v_slug is null or length(v_slug) = 0 then
    v_slug := 'workspace';
  end if;
  v_slug_try := v_slug;

  loop
    exit when not exists (select 1 from public.organizations where slug = v_slug_try);
    v_attempt := v_attempt + 1;
    if v_attempt > 10 then
      v_slug_try := v_slug || '-' || substring(p_uid::text, 1, 8);
      exit;
    end if;
    v_slug_try := v_slug || '-' || substring(p_uid::text, 1, 4 + v_attempt);
  end loop;

  insert into public.organizations (name, slug)
  values (v_org_name, v_slug_try)
  returning id into v_org_id;

  insert into public.organization_members (user_id, organization_id, role)
  values (p_uid, v_org_id, 'owner');
end;
$$;

-- INSERT path: provision when the email is already known.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if NEW.email is not null then
    perform public.provision_new_user(NEW.id, NEW.email, NEW.raw_user_meta_data);
  end if;
  return NEW;
exception when others then
  raise warning 'handle_new_user failed for user %: %', NEW.id, sqlerrm;
  return NEW;
end;
$$;

-- UPDATE path: provision once the email is set (OAuth), if not already provisioned.
create or replace function public.handle_user_email_set()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if NEW.email is not null and (OLD.email is distinct from NEW.email) then
    perform public.provision_new_user(NEW.id, NEW.email, NEW.raw_user_meta_data);
  end if;
  return NEW;
exception when others then
  raise warning 'handle_user_email_set failed for user %: %', NEW.id, sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists trg_handle_user_email_set on auth.users;
create trigger trg_handle_user_email_set
  after update on auth.users
  for each row execute function public.handle_user_email_set();
