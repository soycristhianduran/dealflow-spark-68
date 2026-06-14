-- WhatsApp templates are shared org-wide: let any org member READ them (writes
-- stay restricted to the owning user + the readonly block already in place).
drop policy if exists "Org members read templates" on public.whatsapp_templates;
create policy "Org members read templates" on public.whatsapp_templates
  for select to authenticated
  using (public.is_org_member(organization_id));
