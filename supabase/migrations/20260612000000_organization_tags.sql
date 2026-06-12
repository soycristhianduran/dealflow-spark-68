-- Central, per-organization tag catalog.
--
-- Tags were previously hardcoded in the Settings UI and never persisted, so a tag
-- created in an automation (e.g. "Reserva 54") never showed up in Settings and
-- there was no shared list to drive dropdowns. This table is the single source of
-- truth; the UI (Settings, automation "add tag", Leads bulk tagging) reads from it
-- and writes new tags back to it.

create table if not exists public.organization_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists organization_tags_org_idx on public.organization_tags(organization_id);

alter table public.organization_tags enable row level security;

drop policy if exists "org members read tags" on public.organization_tags;
create policy "org members read tags" on public.organization_tags
  for select using (
    organization_id in (select organization_id from public.organization_members where user_id = auth.uid())
  );

drop policy if exists "org members insert tags" on public.organization_tags;
create policy "org members insert tags" on public.organization_tags
  for insert with check (
    organization_id in (select organization_id from public.organization_members where user_id = auth.uid())
  );

drop policy if exists "org members delete tags" on public.organization_tags;
create policy "org members delete tags" on public.organization_tags
  for delete using (
    organization_id in (select organization_id from public.organization_members where user_id = auth.uid())
  );

-- ── Seed from tags already used on contacts so existing tags appear immediately ──
insert into public.organization_tags (organization_id, name)
select distinct c.organization_id, t.tag
from public.contacts c
cross join lateral unnest(c.tags) as t(tag)
where c.organization_id is not null and coalesce(trim(t.tag), '') <> ''
on conflict (organization_id, name) do nothing;

-- ── Seed from tags referenced by automation "add_tag" steps ──
insert into public.organization_tags (organization_id, name)
select distinct a.organization_id, (step->'config'->>'tag') as tag
from public.automations a
cross join lateral jsonb_array_elements(coalesce(a.steps, '[]'::jsonb)) as step
where a.organization_id is not null
  and step->>'type' = 'add_tag'
  and coalesce(trim(step->'config'->>'tag'), '') <> ''
on conflict (organization_id, name) do nothing;
