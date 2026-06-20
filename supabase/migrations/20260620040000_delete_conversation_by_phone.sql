
-- When a lead is deleted, remove its WhatsApp conversation by PHONE (covers
-- duplicate contacts + orphaned messages that share the number; the FK cascade
-- alone only removes messages linked by contact_id).
create or replace function public.delete_contact_conversations()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if old.primary_phone is not null
     and length(regexp_replace(old.primary_phone,'[^0-9]','','g')) >= 7 then
    delete from public.whatsapp_messages
     where organization_id = old.organization_id
       and regexp_replace(phone_number,'[^0-9]','','g') = regexp_replace(old.primary_phone,'[^0-9]','','g');
  end if;
  return old;
end $$;

drop trigger if exists trg_delete_contact_conversations on public.contacts;
create trigger trg_delete_contact_conversations
  after delete on public.contacts
  for each row execute function public.delete_contact_conversations();
