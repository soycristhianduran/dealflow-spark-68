
-- When a lead (contact) is deleted, also delete its conversations (was SET NULL → orphaned).
alter table public.whatsapp_messages drop constraint if exists whatsapp_messages_contact_id_fkey;
alter table public.whatsapp_messages add constraint whatsapp_messages_contact_id_fkey
  foreign key (contact_id) references public.contacts(id) on delete cascade;

alter table public.instagram_conversations drop constraint if exists instagram_conversations_contact_id_fkey;
alter table public.instagram_conversations add constraint instagram_conversations_contact_id_fkey
  foreign key (contact_id) references public.contacts(id) on delete cascade;
