DO $$
DECLARE v_url TEXT := 'https://oqwcgvemrvimrdrzjzil.supabase.co';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN RETURN; END IF;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='campaign-sender-scan';
  PERFORM cron.schedule('campaign-sender-scan','*/5 * * * *',
    format($job$ SELECT net.http_post(url:=%L,
      headers:=jsonb_build_object('Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='service_role_key' LIMIT 1),'Content-Type','application/json'),
      body:='{}'::jsonb) $job$, v_url||'/functions/v1/campaign-sender'));
END $$;
