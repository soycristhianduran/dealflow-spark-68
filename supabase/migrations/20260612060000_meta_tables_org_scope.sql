-- Add organization_id to the Meta/WhatsApp tables that were scoped only by user_id,
-- so a user who belongs to several orgs can't see another org's data. Tables are
-- (almost) empty, so backfill is trivial. RLS is made tolerant: enforce org
-- membership when organization_id is set, and fall back to the owner (user_id) for
-- legacy NULL-org rows so nothing breaks during the transition.

alter table public.meta_ads          add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.meta_adsets       add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.meta_campaigns    add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.facebook_messages add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.channels          add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- Backfill from the owner's membership (single-org users → their org).
update public.channels c
  set organization_id = (select om.organization_id from public.organization_members om where om.user_id = c.user_id limit 1)
  where c.organization_id is null;
update public.meta_campaigns x
  set organization_id = (select ft.organization_id from public.facebook_tokens ft where ft.user_id = x.user_id limit 1)
  where x.organization_id is null;

create index if not exists meta_ads_org_idx          on public.meta_ads(organization_id);
create index if not exists meta_adsets_org_idx       on public.meta_adsets(organization_id);
create index if not exists meta_campaigns_org_idx    on public.meta_campaigns(organization_id);
create index if not exists facebook_messages_org_idx on public.facebook_messages(organization_id);
create index if not exists channels_org_idx          on public.channels(organization_id);

-- ── Replace user_id-only policies with org-scoped (tolerant) ones ──
do $$
declare
  r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname='public'
      and tablename in ('meta_ads','meta_adsets','meta_campaigns','facebook_messages','channels')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy "meta_ads_org" on public.meta_ads for all
  using (public.is_org_member(organization_id) or (organization_id is null and auth.uid() = user_id))
  with check (public.is_org_member(organization_id) or (organization_id is null and auth.uid() = user_id));

create policy "meta_adsets_org" on public.meta_adsets for all
  using (public.is_org_member(organization_id) or (organization_id is null and auth.uid() = user_id))
  with check (public.is_org_member(organization_id) or (organization_id is null and auth.uid() = user_id));

create policy "meta_campaigns_org" on public.meta_campaigns for all
  using (public.is_org_member(organization_id) or (organization_id is null and auth.uid() = user_id))
  with check (public.is_org_member(organization_id) or (organization_id is null and auth.uid() = user_id));

create policy "facebook_messages_org" on public.facebook_messages for all
  using (public.is_org_member(organization_id) or (organization_id is null and auth.uid() = user_id))
  with check (public.is_org_member(organization_id) or (organization_id is null and auth.uid() = user_id));

create policy "channels_org" on public.channels for all
  using (public.is_org_member(organization_id) or (organization_id is null and auth.uid() = user_id))
  with check (public.is_org_member(organization_id) or (organization_id is null and auth.uid() = user_id));
