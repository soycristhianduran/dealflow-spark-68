-- Allow conversation deletion from the inbox: admins/managers (see-all roles)
-- can delete WhatsApp messages of their org. IG/Messenger already allow it
-- via their ALL policies.
drop policy if exists whatsapp_messages_scoped_delete on public.whatsapp_messages;
create policy whatsapp_messages_scoped_delete on public.whatsapp_messages
  for delete using (org_conv_see_all(organization_id));
