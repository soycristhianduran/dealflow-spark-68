-- STRUCTURAL multi-tenant hardening (applied live 2026-07-10).
--
-- Root cause of every cross-org misfile: the platform was built assuming
-- 1 user = 1 org, so writes lacking organization_id were "helpfully" filed
-- under the writer's org — ambiguous and wrong for multi-org users (gestor).
--
-- Layers installed here:
--  1. Anchor guards run FIRST (set_organization_id_trigger renamed to
--     zzz_* so zz_enforce_org_matches_{contact,funnel,pipeline,related}
--     resolve the org from the anchored entity before any defaulting).
--  2. New guards: activities follow their related contact/deal/company;
--     pipeline_stages follow their pipeline.
--  3. set_organization_id_on_insert NEVER guesses for multi-org users:
--     no explicit org + no anchor → RAISE organization_id_required.
--     Single-org users keep the convenience.

-- (1) rename so defaulting runs last
do $do$
declare r record;
begin
  for r in (select c.relname from pg_trigger t join pg_class c on c.oid=t.tgrelid
            where t.tgname='set_organization_id_trigger' and not t.tgisinternal)
  loop
    execute format('alter trigger set_organization_id_trigger on public.%I rename to zzz_set_organization_id_trigger', r.relname);
  end loop;
end $do$;

-- (2a) activities → related entity's org
create or replace function public.enforce_org_matches_related() returns trigger
language plpgsql security definer set search_path to 'public' as $tg$
declare v_org uuid;
begin
  if NEW.related_entity_id is not null then
    if NEW.related_entity_type = 'contact' then
      select organization_id into v_org from contacts where id = NEW.related_entity_id;
    elsif NEW.related_entity_type = 'deal' then
      select organization_id into v_org from deals where id = NEW.related_entity_id;
    elsif NEW.related_entity_type = 'company' then
      select organization_id into v_org from companies where id = NEW.related_entity_id;
    end if;
    if v_org is not null and (NEW.organization_id is distinct from v_org) then
      NEW.organization_id := v_org;
    end if;
  end if;
  return NEW;
end $tg$;
drop trigger if exists zz_enforce_org_matches_related on public.activities;
create trigger zz_enforce_org_matches_related
  before insert or update of related_entity_id, organization_id on public.activities
  for each row execute function public.enforce_org_matches_related();

-- (2b) pipeline_stages → pipeline's org
create or replace function public.enforce_org_matches_pipeline() returns trigger
language plpgsql security definer set search_path to 'public' as $tg$
declare v_org uuid;
begin
  if NEW.pipeline_id is not null then
    select organization_id into v_org from pipelines where id = NEW.pipeline_id;
    if v_org is not null and (NEW.organization_id is distinct from v_org) then
      NEW.organization_id := v_org;
    end if;
  end if;
  return NEW;
end $tg$;
drop trigger if exists zz_enforce_org_matches_pipeline on public.pipeline_stages;
create trigger zz_enforce_org_matches_pipeline
  before insert or update of pipeline_id, organization_id on public.pipeline_stages
  for each row execute function public.enforce_org_matches_pipeline();

-- (3) strict defaulting
create or replace function public.set_organization_id_on_insert() returns trigger
language plpgsql security definer set search_path to 'public' as $fn$
declare
  user_col text; user_val uuid; new_json jsonb; v_n int; v_org uuid;
begin
  if NEW.organization_id is not null then return NEW; end if;

  if auth.uid() is not null then
    select count(distinct organization_id), min(organization_id::text)::uuid into v_n, v_org
      from organization_members where user_id = auth.uid();
    if v_n = 1 then NEW.organization_id := v_org; return NEW; end if;
    if v_n > 1 then
      raise exception 'organization_id_required'
        using detail = 'Multi-org user: the write must carry an explicit organization_id (or an anchored entity).',
              errcode = 'P0001';
    end if;
    return NEW;
  end if;

  user_col := TG_ARGV[0];
  if user_col is not null and user_col <> '' then
    new_json := to_jsonb(NEW);
    user_val := nullif(new_json ->> user_col, '')::uuid;
    if user_val is not null then
      select count(distinct organization_id), min(organization_id::text)::uuid into v_n, v_org
        from organization_members where user_id = user_val;
      if v_n = 1 then NEW.organization_id := v_org; return NEW; end if;
      if v_n > 1 then
        raise exception 'organization_id_required'
          using detail = 'Row user belongs to several orgs: pass organization_id explicitly.',
                errcode = 'P0001';
      end if;
    end if;
  end if;
  return NEW;
end $fn$;
