-- Block readonly members from updating the organization (name, slug, settings).
drop policy if exists rw_block_readonly_upd on public.organizations;
create policy rw_block_readonly_upd on public.organizations
  as restrictive for update to authenticated
  using (public.org_can_write(id)) with check (public.org_can_write(id));
