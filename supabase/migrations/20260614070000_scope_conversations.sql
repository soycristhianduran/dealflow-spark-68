-- Scope conversations by lead ownership.
-- owner/admin/readonly → see ALL org conversations (supervision / manager view).
-- vendor/setter        → only chats of leads where they are owner OR setter.
-- unassigned (no contact / no owner) → only the "see all" roles.

create or replace function public.org_conv_see_all(p_org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
     where organization_id = p_org and user_id = auth.uid()
       and role in ('owner','admin','readonly')
  );
$$;

-- WhatsApp messages (SELECT only — keep existing write policies intact)
drop policy if exists whatsapp_messages_org_select on public.whatsapp_messages;
create policy whatsapp_messages_scoped_select on public.whatsapp_messages
  for select to authenticated using (
    public.org_conv_see_all(organization_id)
    or exists (
      select 1 from public.contacts c
       where c.id = whatsapp_messages.contact_id
         and (c.owner_id = auth.uid() or c.setter_id = auth.uid())
    )
  );

-- Instagram conversations (ALL → scope read; writes still need org membership)
drop policy if exists ig_conversations_org on public.instagram_conversations;
create policy ig_conversations_scoped on public.instagram_conversations
  for all to authenticated using (
    public.org_conv_see_all(organization_id)
    or exists (
      select 1 from public.contacts c
       where c.id = instagram_conversations.contact_id
         and (c.owner_id = auth.uid() or c.setter_id = auth.uid())
    )
  ) with check (public.is_org_member(organization_id));

-- Instagram messages (scope via their conversation's ownership)
drop policy if exists ig_messages_org on public.instagram_messages;
create policy ig_messages_scoped on public.instagram_messages
  for all to authenticated using (
    exists (
      select 1 from public.instagram_conversations ic
       where ic.id = instagram_messages.conversation_id
         and (
           public.org_conv_see_all(ic.organization_id)
           or exists (select 1 from public.contacts c where c.id = ic.contact_id and (c.owner_id = auth.uid() or c.setter_id = auth.uid()))
         )
    )
  ) with check (public.is_org_member(organization_id));
