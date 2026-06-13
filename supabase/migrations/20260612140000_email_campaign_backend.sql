-- Server-side email campaign sending + scheduling (mirrors WhatsApp).
-- Email blasts ran in the browser (per-contact loop; stops if the tab closes).
-- Now: frontend inserts the campaign as 'queued' with the recipient list, then
-- flips status queued→sending. A trigger fires send-email's send_campaign action
-- server-side (batched, idempotent). The cron sends scheduled ones at their time
-- and recovers anything stuck — no browser needed.

create or replace function public.fire_email_campaign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Fires for both the frontend's queued→sending flip and the cron's
  -- scheduled→sending flip. The worker's own sending→sending update never matches.
  if new.status = 'sending'
     and old.status in ('queued', 'scheduled') then
    perform net.http_post(
      url := 'https://oqwcgvemrvimrdrzjzil.supabase.co/functions/v1/send-email',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('action', 'send_campaign', 'campaign_id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_email_campaign_send on public.email_campaigns;
create trigger trg_email_campaign_send
after update of status on public.email_campaigns
for each row
execute function public.fire_email_campaign();

-- Cron: every 2 min, flip due scheduled + stale queued email campaigns to
-- 'sending' (which fires the trigger above). Pure SQL — no extra function.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN RETURN; END IF;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='email-campaign-scan';
  PERFORM cron.schedule('email-campaign-scan','*/2 * * * *', $job$
    update public.email_campaigns
      set status='sending', updated_at=now()
      where (status='scheduled' and scheduled_at <= now())
         or (status='queued' and updated_at < now() - interval '2 minutes');
  $job$);
END $$;
