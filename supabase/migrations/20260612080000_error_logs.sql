-- Structured error log for critical background failures (webhooks, automation
-- runner, OAuth token saves, etc.). The recurring theme this cycle was SILENT
-- failures — things broke for weeks without anyone knowing. This table captures
-- them so they're queryable and can drive a daily digest/alert.

create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null,                 -- e.g. 'stripe-webhook', 'automation-runner'
  level text not null default 'error',  -- 'error' | 'warn' | 'digest'
  message text not null,
  context jsonb,                         -- arbitrary detail (ids, payload snippet)
  organization_id uuid references public.organizations(id) on delete set null
);

create index if not exists error_logs_created_idx on public.error_logs(created_at desc);
create index if not exists error_logs_source_idx on public.error_logs(source);

alter table public.error_logs enable row level security;

-- Only platform owners (owners of any org) can read; writes are service-role only
-- (edge functions). No INSERT policy → the anon/authenticated keys can't write,
-- but the service role bypasses RLS.
drop policy if exists "owners read error logs" on public.error_logs;
create policy "owners read error logs" on public.error_logs
  for select using (
    exists (select 1 from public.organization_members m where m.user_id = auth.uid() and m.role = 'owner')
  );
