-- Daily error digest: emails the owner a summary if anything failed in the last
-- 24h (silent failures were the recurring pain). Runs 13:00 UTC (≈8am Colombia).

DO $$
DECLARE
  v_supabase_url TEXT := 'https://oqwcgvemrvimrdrzjzil.supabase.co';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — error-digest cron NOT scheduled';
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'error-digest-daily';

  PERFORM cron.schedule(
    'error-digest-daily',
    '0 13 * * *',
    format($job$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1
          ),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      ) AS request_id;
    $job$, v_supabase_url || '/functions/v1/error-digest')
  );

  RAISE NOTICE '✓ error-digest-daily cron scheduled (13:00 UTC)';
END $$;
