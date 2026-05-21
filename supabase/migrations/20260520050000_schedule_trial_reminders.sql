-- ============================================================================
-- Schedule the daily trial-reminder cron
-- ============================================================================
-- Fires once per day at 14:00 UTC (≈9am Colombia, friendly send time for
-- the recipient's morning inbox without being too early).
--
-- The function itself handles both:
--   - trial_ending (3 days before expiry)
--   - trial_ended  (post-expiry, locks the workspace)
--
-- Requires `service_role_key` to already exist in Vault (set during
-- migration 20260520000000).
-- ============================================================================

DO $$
DECLARE
  v_supabase_url TEXT := 'https://oqwcgvemrvimrdrzjzil.supabase.co';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — trial-reminder cron NOT scheduled';
    RETURN;
  END IF;

  -- Idempotent: drop any previous version of this job
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'trial-reminders-daily';

  PERFORM cron.schedule(
    'trial-reminders-daily',
    '0 14 * * *',  -- daily at 14:00 UTC (9am Colombia)
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
    $job$, v_supabase_url || '/functions/v1/cron-trial-reminders')
  );

  RAISE NOTICE '✓ trial-reminders-daily cron scheduled (14:00 UTC)';
END $$;
