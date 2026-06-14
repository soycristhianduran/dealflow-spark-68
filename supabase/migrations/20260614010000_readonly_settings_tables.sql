-- Extend read-only write-block to settings tables (API keys, custom fields,
-- email domains). Readonly can view; cannot write.
do $$
declare
  t text;
  tables text[] := array['api_keys','custom_field_definitions','email_domains'];
begin
  foreach t in array tables loop
    execute format('drop policy if exists rw_block_readonly_ins on public.%I', t);
    execute format('drop policy if exists rw_block_readonly_upd on public.%I', t);
    execute format('drop policy if exists rw_block_readonly_del on public.%I', t);
    execute format('create policy rw_block_readonly_ins on public.%I as restrictive for insert to authenticated with check (public.org_can_write(organization_id))', t);
    execute format('create policy rw_block_readonly_upd on public.%I as restrictive for update to authenticated using (public.org_can_write(organization_id)) with check (public.org_can_write(organization_id))', t);
    execute format('create policy rw_block_readonly_del on public.%I as restrictive for delete to authenticated using (public.org_can_write(organization_id))', t);
  end loop;
end $$;
