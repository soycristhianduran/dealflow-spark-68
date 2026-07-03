-- RRSS Automations: allow comment automations to target Facebook too.
alter table public.instagram_comment_automations
  add column if not exists networks text[] not null default '{instagram}',
  add column if not exists fb_page_id text;

-- Facebook page comments (mirror of instagram_comments for the FB network)
create table if not exists public.facebook_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  organization_id uuid,
  page_id text not null,
  comment_id text not null unique,
  parent_comment_id text,
  post_id text,
  commenter_id text,
  commenter_name text,
  text text,
  is_replied boolean not null default false,
  is_dm_sent boolean not null default false,
  matched_automation_id uuid,
  created_at timestamptz not null default now()
);

alter table public.facebook_comments enable row level security;

drop policy if exists fb_comments_org on public.facebook_comments;
create policy fb_comments_org on public.facebook_comments
  for all using (is_org_member(organization_id))
  with check (is_org_member(organization_id));

-- FB-only automations have no IG account
alter table public.instagram_comment_automations alter column ig_account_id drop not null;
