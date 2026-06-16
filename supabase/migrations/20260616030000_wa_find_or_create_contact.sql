-- Race-safe find-or-create for WhatsApp inbound contacts.
-- Two webhook deliveries arriving simultaneously used to each run a
-- "find contact → none → insert" sequence, producing duplicate leads.
-- This function serializes that path with a per-(org, normalized-phone)
-- advisory lock and matches on a digits-only phone so "+57 3244..." and
-- "+573244..." resolve to the same lead.
create or replace function wa_find_or_create_contact(
  p_org uuid, p_owner uuid, p_phone text, p_first text, p_last text, p_full text
) returns table(contact_id uuid, was_created boolean)
language plpgsql security definer as $$
declare v_norm text; v_id uuid; v_plus text;
begin
  v_norm := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  if v_norm = '' then return; end if;
  v_plus := '+' || v_norm;
  -- serialize concurrent webhook deliveries for the same number
  perform pg_advisory_xact_lock(hashtext(p_org::text || ':' || v_norm));
  select id into v_id from contacts
   where organization_id = p_org
     and primary_phone is not null
     and regexp_replace(primary_phone,'[^0-9]','','g') = v_norm
   order by created_at asc limit 1;
  if v_id is not null then
    contact_id := v_id; was_created := false; return next; return;
  end if;
  insert into contacts(owner_id, organization_id, primary_phone, first_name, last_name, full_name, source)
  values(p_owner, p_org, v_plus, p_first, p_last, coalesce(p_full, v_plus), 'whatsapp')
  returning id into v_id;
  contact_id := v_id; was_created := true; return next;
end; $$;
