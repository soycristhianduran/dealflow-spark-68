-- Messenger channel: conversations + messages (mirror of the Instagram tables)
create table if not exists public.messenger_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  organization_id uuid,
  page_id text not null,
  participant_id text not null,          -- PSID
  participant_name text,
  participant_profile_pic text,
  contact_id uuid,
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  unread_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (page_id, participant_id)
);

create table if not exists public.messenger_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  organization_id uuid,
  page_id text not null,
  conversation_id uuid not null references public.messenger_conversations(id) on delete cascade,
  mid text unique,
  direction text not null check (direction in ('incoming','outgoing')),
  message_type text not null default 'text',
  message_text text,
  attachment_url text,
  sender_id text,
  recipient_id text,
  status text not null default 'sent',
  error_details text,
  is_ai_generated boolean not null default false,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_msgr_msgs_conv on public.messenger_messages(conversation_id, sent_at);
create index if not exists idx_msgr_convs_org on public.messenger_conversations(organization_id, last_message_at desc);

alter table public.messenger_conversations enable row level security;
alter table public.messenger_messages enable row level security;

drop policy if exists msgr_convs_org on public.messenger_conversations;
create policy msgr_convs_org on public.messenger_conversations
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));

drop policy if exists msgr_msgs_org on public.messenger_messages;
create policy msgr_msgs_org on public.messenger_messages
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));

-- Realtime for the inbox
do $$ begin
  alter publication supabase_realtime add table public.messenger_conversations;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.messenger_messages;
exception when duplicate_object then null; end $$;
