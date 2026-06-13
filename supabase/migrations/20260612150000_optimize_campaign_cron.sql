DO $$
DECLARE v_url TEXT := 'https://oqwcgvemrvimrdrzjzil.supabase.co';
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='campaign-sender-scan';
  -- Conditional: only invoke the worker when there's actual work (scheduled due
  -- or stuck campaigns). Idle → zero edge-function invocations. Instant sends use
  -- the DB trigger, so this change does NOT affect normal "send now".
  PERFORM cron.schedule('campaign-sender-scan','*/2 * * * *', format($job$
    DO $inner$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM public.whatsapp_campaigns
        WHERE (status='scheduled' AND scheduled_at <= now())
           OR (status IN ('sending','queued') AND updated_at < now() - interval '2 minutes')
      ) THEN
        PERFORM net.http_post(
          url := %L,
          headers := jsonb_build_object('Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='service_role_key' LIMIT 1),'Content-Type','application/json'),
          body := '{}'::jsonb
        );
      END IF;
    END $inner$;
  $job$, v_url||'/functions/v1/campaign-sender'));
END $$;
