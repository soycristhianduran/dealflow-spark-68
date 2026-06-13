-- WhatsApp campaign scheduling + server-side sending.
-- Sends were done in the browser (only the loaded page got processed, and you had
-- to keep the tab open). Move sending to the backend: a campaign stores its config
-- + a 'pending' whatsapp_sends row per recipient; a worker sends them server-side,
-- now or at scheduled_at.

alter table public.whatsapp_campaigns add column if not exists scheduled_at timestamptz;
alter table public.whatsapp_campaigns add column if not exists language text default 'es';
alter table public.whatsapp_campaigns add column if not exists variables jsonb default '[]'::jsonb;
alter table public.whatsapp_campaigns add column if not exists media_id text;

create index if not exists whatsapp_campaigns_scheduled_idx
  on public.whatsapp_campaigns(status, scheduled_at);

-- status values used: 'scheduled' | 'sending' | 'sent'
-- whatsapp_sends.status adds 'pending' (not yet sent by the worker).
