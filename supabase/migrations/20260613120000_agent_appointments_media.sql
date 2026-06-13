-- AI Chat Agent upgrades: appointment booking (Google Calendar) + media library.
--
-- 1) New config columns so each org controls whether the agent can book, the
--    default duration, and its working hours (so it never offers a 3am slot).
-- 2) agent_media: per-org library of images/PDFs the agent can send, each with a
--    description telling the agent WHEN to send it.

-- ── Config columns ────────────────────────────────────────────────────────────
alter table public.ai_agent_configs
  add column if not exists appointments_enabled boolean not null default false,
  add column if not exists appointment_duration_min integer not null default 30,
  add column if not exists working_hours jsonb not null default jsonb_build_object(
    'mon', jsonb_build_object('enabled', true,  'start', '09:00', 'end', '18:00'),
    'tue', jsonb_build_object('enabled', true,  'start', '09:00', 'end', '18:00'),
    'wed', jsonb_build_object('enabled', true,  'start', '09:00', 'end', '18:00'),
    'thu', jsonb_build_object('enabled', true,  'start', '09:00', 'end', '18:00'),
    'fri', jsonb_build_object('enabled', true,  'start', '09:00', 'end', '18:00'),
    'sat', jsonb_build_object('enabled', false, 'start', '09:00', 'end', '13:00'),
    'sun', jsonb_build_object('enabled', false, 'start', '09:00', 'end', '13:00')
  );

-- ── Media library ─────────────────────────────────────────────────────────────
create table if not exists public.agent_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  description text,                       -- when the agent should send this asset
  file_url text not null,
  file_type text not null default 'image', -- 'image' | 'document'
  mime text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists agent_media_org_idx on public.agent_media (organization_id);

alter table public.agent_media enable row level security;

drop policy if exists agent_media_select on public.agent_media;
create policy agent_media_select on public.agent_media
  for select using (public.is_org_member(organization_id));

drop policy if exists agent_media_insert on public.agent_media;
create policy agent_media_insert on public.agent_media
  for insert with check (public.is_org_member(organization_id));

drop policy if exists agent_media_update on public.agent_media;
create policy agent_media_update on public.agent_media
  for update using (public.is_org_member(organization_id));

drop policy if exists agent_media_delete on public.agent_media;
create policy agent_media_delete on public.agent_media
  for delete using (public.is_org_member(organization_id));

-- ── Storage bucket for the media files (public read so WhatsApp can fetch link) ─
insert into storage.buckets (id, name, public)
values ('agent-media', 'agent-media', true)
on conflict (id) do nothing;

drop policy if exists "agent-media read" on storage.objects;
create policy "agent-media read" on storage.objects
  for select using (bucket_id = 'agent-media');

drop policy if exists "agent-media write" on storage.objects;
create policy "agent-media write" on storage.objects
  for insert with check (bucket_id = 'agent-media' and auth.role() = 'authenticated');

drop policy if exists "agent-media delete" on storage.objects;
create policy "agent-media delete" on storage.objects
  for delete using (bucket_id = 'agent-media' and auth.role() = 'authenticated');
