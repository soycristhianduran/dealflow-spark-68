-- ════════════════════════════════════════════════════════════════════════════
-- Enforce the "readonly" (Solo lectura) role at the database level.
-- Readonly members see EVERYTHING (like an admin) but cannot write anything.
-- Implemented with RESTRICTIVE policies for INSERT/UPDATE/DELETE (these AND with
-- the existing permissive policies and do NOT affect SELECT), so reads are
-- unchanged while writes require a non-readonly role.
-- Service-role (edge functions) and SECURITY DEFINER triggers bypass RLS, so
-- automated flows are unaffected.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.org_can_write(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.organization_members
     where organization_id = p_org
       and user_id = auth.uid()
       and role <> 'readonly'
  );
$$;

do $$
declare
  t text;
  tables text[] := array[
    'contacts','companies','deals','activities','meetings','tasks',
    'pipelines','pipeline_stages','ai_agent_configs','whatsapp_campaigns'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists rw_block_readonly_ins on public.%I', t);
    execute format('drop policy if exists rw_block_readonly_upd on public.%I', t);
    execute format('drop policy if exists rw_block_readonly_del on public.%I', t);

    execute format(
      'create policy rw_block_readonly_ins on public.%I as restrictive for insert to authenticated with check (public.org_can_write(organization_id))', t);
    execute format(
      'create policy rw_block_readonly_upd on public.%I as restrictive for update to authenticated using (public.org_can_write(organization_id)) with check (public.org_can_write(organization_id))', t);
    execute format(
      'create policy rw_block_readonly_del on public.%I as restrictive for delete to authenticated using (public.org_can_write(organization_id))', t);
  end loop;
end $$;
