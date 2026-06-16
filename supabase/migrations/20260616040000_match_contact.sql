-- Unified cross-channel lead matcher.
-- Returns an existing contact id for the org that matches the incoming lead by
-- NORMALIZED phone (digits-only, so "+57 3244..." == "+573244...") OR by email.
-- Used by every lead entry point (Meta Lead Forms, Messenger, landing pages,
-- embed forms, public API, WhatsApp) so the same person arriving from a second
-- channel enriches the original lead instead of creating a duplicate. The
-- original first-touch `source` is preserved by callers (they never overwrite it).
create or replace function match_contact(p_org uuid, p_phone text, p_email text)
returns uuid language sql stable security definer as $$
  select id from contacts
   where organization_id = p_org
     and (
       (nullif(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),'') is not null
         and length(regexp_replace(p_phone,'[^0-9]','','g')) >= 7
         and regexp_replace(coalesce(primary_phone,''),'[^0-9]','','g') = regexp_replace(p_phone,'[^0-9]','','g'))
       or
       (nullif(trim(lower(coalesce(p_email,''))),'') is not null
         and lower(trim(primary_email)) = lower(trim(p_email)))
     )
   order by created_at asc
   limit 1;
$$;
