-- WA name self-heal (applied live 2026-07-08).
-- Contacts migrated from chat-based CRMs (Kommo) often have no human name —
-- only the phone. WhatsApp DOES send the person's profile name with every
-- inbound message, so wa_find_or_create_contact now heals junk display names
-- (phone-as-name, "Facebook №…", empty, "Sin nombre") with the WA profile
-- name when the person writes in. Real, human-entered names are NEVER
-- overwritten.
create or replace function public.wa_find_or_create_contact(
  p_org uuid, p_owner uuid, p_phone text, p_first text, p_last text, p_full text
) returns table(contact_id uuid, was_created boolean)
language plpgsql security definer as $fn$
declare v_norm text; v_id uuid; v_plus text; v_cur_name text;
begin
  v_norm := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  if v_norm = '' then return; end if;
  v_plus := '+' || v_norm;
  perform pg_advisory_xact_lock(hashtext(p_org::text || ':' || v_norm));
  select id, full_name into v_id, v_cur_name from contacts
   where organization_id = p_org and primary_phone is not null
     and regexp_replace(primary_phone,'[^0-9]','','g') = v_norm
   order by created_at asc limit 1;
  if v_id is not null then
    if p_full is not null and btrim(p_full) <> ''
       and regexp_replace(p_full,'[^0-9]','','g') <> v_norm
       and (v_cur_name is null or btrim(v_cur_name) = ''
            or regexp_replace(v_cur_name,'[^0-9]','','g') = v_norm
            or v_cur_name ~ '№'
            or v_cur_name ~* '^(facebook|whatsapp|instagram|telegram)'
            or v_cur_name ~* '^sin nombre') then
      update contacts set full_name = btrim(p_full),
        first_name = coalesce(p_first, first_name),
        last_name  = coalesce(p_last, last_name)
      where id = v_id;
    end if;
    contact_id := v_id; was_created := false; return next; return;
  end if;
  insert into contacts(owner_id, organization_id, primary_phone, first_name, last_name, full_name, source)
  values(p_owner, p_org, v_plus, p_first, p_last, coalesce(p_full, v_plus), 'whatsapp')
  returning id into v_id;
  contact_id := v_id; was_created := true; return next;
end;
$fn$;
