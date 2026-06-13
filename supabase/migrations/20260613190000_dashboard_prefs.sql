create table if not exists public.user_dashboard_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  layout jsonb not null default '[]'::jsonb,
  hidden jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_dashboard_prefs enable row level security;
drop policy if exists udp_rw on public.user_dashboard_prefs;
create policy udp_rw on public.user_dashboard_prefs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
