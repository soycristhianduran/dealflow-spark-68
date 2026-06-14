-- Scope WhatsApp message UPDATE (read_at) the same as SELECT, so a vendor/setter's
-- "mark all read" only touches their own leads' chats (not the whole org).
drop policy if exists whatsapp_messages_org_update on public.whatsapp_messages;
create policy whatsapp_messages_scoped_update on public.whatsapp_messages
  for update to authenticated
  using (
    public.org_conv_see_all(organization_id)
    or exists (select 1 from public.contacts c where c.id = whatsapp_messages.contact_id and (c.owner_id = auth.uid() or c.setter_id = auth.uid()))
  )
  with check (public.is_org_member(organization_id));
