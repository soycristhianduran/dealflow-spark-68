-- Definitive instant campaign trigger (server-side, no browser dependency).
--
-- The browser-side invoke of campaign-sender was unreliable (fire-and-forget got
-- dropped), so "send now" only went out when the 2-min cron caught it. Instead,
-- fire campaign-sender from a DB trigger the moment the frontend marks a campaign
-- ready: it inserts the campaign as 'queued', inserts the recipient rows, then
-- UPDATEs status 'queued' → 'sending'. That single transition fires the worker via
-- pg_net — instantly and reliably.
--
-- The condition (old='queued') ensures the worker's own internal status='sending'
-- updates (from 'scheduled' or resumes) do NOT re-fire the trigger (no double-send
-- / no loop). Scheduled campaigns stay 'scheduled' and are handled by the cron.

create or replace function public.fire_campaign_sender()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'sending'
     and old.status = 'queued'
     and new.scheduled_at is null then
    perform net.http_post(
      url := 'https://oqwcgvemrvimrdrzjzil.supabase.co/functions/v1/campaign-sender',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('campaign_id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_campaign_send on public.whatsapp_campaigns;
create trigger trg_campaign_send
after update of status on public.whatsapp_campaigns
for each row
execute function public.fire_campaign_sender();
