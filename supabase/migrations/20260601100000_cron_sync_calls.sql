-- ============================================================
-- Schedule cron-sync-calls edge function every 5 minutes
--
-- This function polls Vapi API for stuck call_logs (status in
-- 'initiated', 'in_progress') older than 3 minutes and updates
-- them with real status, transcript, and recording URL.
-- It's a reliable fallback for when Vapi webhooks fail to fire.
--
-- The function has no auth requirement (open endpoint) so this
-- cron job does not need a secret.
-- ============================================================

DO $$
DECLARE
  v_supabase_url TEXT := 'https://oqwcgvemrvimrdrzjzil.supabase.co';
BEGIN
  -- Only proceed if pg_cron is installed
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — sync job NOT scheduled. Enable via Supabase Dashboard → Database → Extensions.';
    RETURN;
  END IF;

  -- Remove any previous version of this job (idempotent)
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'cron-sync-calls';

  -- Schedule every 5 minutes
  PERFORM cron.schedule(
    'cron-sync-calls',
    '*/5 * * * *',
    format($job$
      SELECT net.http_post(
        url     := %L,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body    := '{}'::jsonb,
        timeout_milliseconds := 55000
      ) AS request_id;
    $job$, v_supabase_url || '/functions/v1/cron-sync-calls')
  );

  RAISE NOTICE '✓ cron-sync-calls scheduled every 5 minutes.';
END $$;
