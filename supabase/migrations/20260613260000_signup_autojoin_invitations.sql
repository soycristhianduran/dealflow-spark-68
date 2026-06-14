-- ════════════════════════════════════════════════════════════════════════════
-- Auto-join invited users to the inviting organization on signup.
-- Previously handle_new_user() only skipped personal-org creation when an
-- 'invite_token' was present in metadata (i.e. only if the user registered via
-- the invite link). Vendors who registered normally with the SAME email got
-- their own personal org and the invitation stayed pending forever.
-- Now: if ANY pending, non-expired invitation matches the new user's email, we
-- join them to those org(s) with the invited role and mark the invite accepted,
-- and we DO NOT create a personal org.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  -- 1. Auto-join any pending invitation that matches this user's email.
  if NEW.email is not null then
    for rec in
      select id, organization_id, role
        from public.organization_invitations
       where lower(email) = lower(NEW.email)
         and accepted_at is null
         and expires_at > now()
    loop
      insert into public.organization_members (user_id, organization_id, role)
      values (NEW.id, rec.organization_id, rec.role)
      on conflict (organization_id, user_id) do nothing;

      update public.organization_invitations
         set accepted_at = now()
       where id = rec.id;

      v_joined := true;
    end loop;
  end if;

  -- If we joined an inviting org, do NOT create a personal workspace.
  if v_joined then
    return NEW;
  end if;

  -- (Legacy) also skip when an invite_token is present but didn't match by email.
  if (NEW.raw_user_meta_data ->> 'invite_token') is not null then
    return NEW;
  end if;

  -- 2. Otherwise create the user's personal workspace (original behaviour).
  v_company   := nullif(trim(coalesce(NEW.raw_user_meta_data ->> 'company_name', '')), '');
  v_full_name := nullif(trim(coalesce(NEW.raw_user_meta_data ->> 'full_name', '')), '');

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
      v_slug_try := v_slug || '-' || substring(NEW.id::text, 1, 8);
      exit;
    end if;
    v_slug_try := v_slug || '-' || substring(NEW.id::text, 1, 4 + v_attempt);
  end loop;

  insert into public.organizations (name, slug)
  values (v_org_name, v_slug_try)
  returning id into v_org_id;

  insert into public.organization_members (user_id, organization_id, role)
  values (NEW.id, v_org_id, 'owner');

  return NEW;
exception when others then
  raise warning 'handle_new_user failed for user %: %', NEW.id, sqlerrm;
  return NEW;
end;
$function$;
