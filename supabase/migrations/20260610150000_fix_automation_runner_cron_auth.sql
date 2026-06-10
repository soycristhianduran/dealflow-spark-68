-- Fix: the automation-runner cron job was created manually in the dashboard with
-- an empty header (headers := '{}'), so every invocation hit the edge function
-- gateway WITHOUT an Authorization bearer and was rejected with HTTP 401. Result:
-- the runner never executed, so NO automation steps were ever processed (enrolled
-- contacts sat forever, delays never advanced, messages never sent).
--
-- This re-schedules the job with the service_role key from Vault (same pattern as
-- the other working cron jobs) so the runner authenticates correctly.

select cron.schedule(
  'automation-runner',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := 'https://oqwcgvemrvimrdrzjzil.supabase.co/functions/v1/automation-runner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'service_role_key' limit 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);
