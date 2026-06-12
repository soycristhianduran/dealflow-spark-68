-- Schedule the daily Stripe reconciliation cron.
-- Safety net that re-syncs every org's subscription from Stripe into our DB,
-- catching missed/failed webhooks (e.g. the outage that left a paid org locked).
-- Runs daily at 08:00 UTC (≈3am Colombia, low-traffic). Idempotent.

DO $$
DECLARE
  v_supabase_url TEXT := 'https://oqwcgvemrvimrdrzjzil.supabase.co';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — stripe-reconcile cron NOT scheduled';
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'stripe-reconcile-daily';

  PERFORM cron.schedule(
    'stripe-reconcile-daily',
    '0 8 * * *',  -- daily at 08:00 UTC
    format($job$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'service_role_key' LIMIT 1
          ),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      ) AS request_id;
    $job$, v_supabase_url || '/functions/v1/stripe-reconcile')
  );

  RAISE NOTICE '✓ stripe-reconcile-daily cron scheduled (08:00 UTC)';
END $$;
