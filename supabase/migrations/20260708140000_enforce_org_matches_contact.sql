-- Multi-tenant integrity guard (applied live 2026-07-08).
-- Root cause: rows with a contact_id could be filed under the WRONG org —
-- set_organization_id_on_insert derives the org from the writing USER, which
-- is ambiguous for multi-org users (gestor). 119 automation-sent WhatsApp
-- messages landed in the sender's personal org instead of the contact's.
-- This trigger makes the CONTACT's org authoritative: any insert/update on a
-- contact-anchored row is forced to the contact's organization, regardless of
-- what the caller (present or future code) passes. Runs after the defaulting
-- trigger (zz_ prefix = later in alphabetical BEFORE-trigger order).

create or replace function public.enforce_org_matches_contact()
returns trigger language plpgsql security definer set search_path to 'public' as $tg$
declare v_org uuid;
begin
  if NEW.contact_id is not null then
    select organization_id into v_org from public.contacts where id = NEW.contact_id;
    if v_org is not null and (NEW.organization_id is distinct from v_org) then
      NEW.organization_id := v_org;
    end if;
  end if;
  return NEW;
end $tg$;

drop trigger if exists zz_enforce_org_matches_contact on public.automation_enrollments;
create trigger zz_enforce_org_matches_contact before insert or update of contact_id, organization_id on public.automation_enrollments for each row execute function public.enforce_org_matches_contact();
drop trigger if exists zz_enforce_org_matches_contact on public.call_logs;
create trigger zz_enforce_org_matches_contact before insert or update of contact_id, organization_id on public.call_logs for each row execute function public.enforce_org_matches_contact();
drop trigger if exists zz_enforce_org_matches_contact on public.deals;
create trigger zz_enforce_org_matches_contact before insert or update of contact_id, organization_id on public.deals for each row execute function public.enforce_org_matches_contact();
drop trigger if exists zz_enforce_org_matches_contact on public.email_sends;
create trigger zz_enforce_org_matches_contact before insert or update of contact_id, organization_id on public.email_sends for each row execute function public.enforce_org_matches_contact();
drop trigger if exists zz_enforce_org_matches_contact on public.facebook_messages;
create trigger zz_enforce_org_matches_contact before insert or update of contact_id, organization_id on public.facebook_messages for each row execute function public.enforce_org_matches_contact();
drop trigger if exists zz_enforce_org_matches_contact on public.instagram_comments;
create trigger zz_enforce_org_matches_contact before insert or update of contact_id, organization_id on public.instagram_comments for each row execute function public.enforce_org_matches_contact();
drop trigger if exists zz_enforce_org_matches_contact on public.instagram_conversations;
create trigger zz_enforce_org_matches_contact before insert or update of contact_id, organization_id on public.instagram_conversations for each row execute function public.enforce_org_matches_contact();
drop trigger if exists zz_enforce_org_matches_contact on public.meetings;
create trigger zz_enforce_org_matches_contact before insert or update of contact_id, organization_id on public.meetings for each row execute function public.enforce_org_matches_contact();
drop trigger if exists zz_enforce_org_matches_contact on public.messenger_conversations;
create trigger zz_enforce_org_matches_contact before insert or update of contact_id, organization_id on public.messenger_conversations for each row execute function public.enforce_org_matches_contact();
drop trigger if exists zz_enforce_org_matches_contact on public.shopify_abandoned_checkouts;
create trigger zz_enforce_org_matches_contact before insert or update of contact_id, organization_id on public.shopify_abandoned_checkouts for each row execute function public.enforce_org_matches_contact();
drop trigger if exists zz_enforce_org_matches_contact on public.tasks;
create trigger zz_enforce_org_matches_contact before insert or update of contact_id, organization_id on public.tasks for each row execute function public.enforce_org_matches_contact();
drop trigger if exists zz_enforce_org_matches_contact on public.whatsapp_messages;
create trigger zz_enforce_org_matches_contact before insert or update of contact_id, organization_id on public.whatsapp_messages for each row execute function public.enforce_org_matches_contact();
drop trigger if exists zz_enforce_org_matches_contact on public.whatsapp_sends;
create trigger zz_enforce_org_matches_contact before insert or update of contact_id, organization_id on public.whatsapp_sends for each row execute function public.enforce_org_matches_contact();
