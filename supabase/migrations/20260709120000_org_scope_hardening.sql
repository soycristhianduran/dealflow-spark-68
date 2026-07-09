-- Cross-org hardening round 2 (applied live 2026-07-09).
-- Root cause of the "Última campaña" leak: dashboard read whatsapp_campaigns
-- without an org filter, so RLS returned every org a multi-org user (gestor)
-- belongs to. Frontend reads fixed in the same commit; this migration adds a
-- write-side guard: a landing page's org always follows its funnel's org
-- (same pattern as enforce_org_matches_contact).
create or replace function public.enforce_org_matches_funnel()
returns trigger language plpgsql security definer set search_path to 'public' as $tg$
declare v_org uuid;
begin
  if NEW.funnel_id is not null then
    select organization_id into v_org from public.landing_funnels where id = NEW.funnel_id;
    if v_org is not null and (NEW.organization_id is distinct from v_org) then
      NEW.organization_id := v_org;
    end if;
  end if;
  return NEW;
end $tg$;

drop trigger if exists zz_enforce_org_matches_funnel on public.landing_pages;
create trigger zz_enforce_org_matches_funnel
  before insert or update of funnel_id, organization_id on public.landing_pages
  for each row execute function public.enforce_org_matches_funnel();
