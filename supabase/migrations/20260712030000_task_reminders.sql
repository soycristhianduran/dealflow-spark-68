-- Recordatorios de tareas: cuándo avisar (remind_at) y si ya se avisó (reminded_at).
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS remind_at timestamptz;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS reminded_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_tasks_remind_at ON public.tasks(remind_at)
  WHERE remind_at IS NOT NULL AND reminded_at IS NULL;

-- Cron: escanea recordatorios vencidos cada 5 minutos y dispara task-reminders.
DO $$
DECLARE v_url TEXT := 'https://oqwcgvemrvimrdrzjzil.supabase.co';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    RAISE NOTICE 'pg_cron no instalado — job NO programado.'; RETURN;
  END IF;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='task-reminders-scan';
  PERFORM cron.schedule('task-reminders-scan','*/5 * * * *',
    format($job$ SELECT net.http_post(url:=%L,
      headers:=jsonb_build_object('Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='service_role_key' LIMIT 1),'Content-Type','application/json'),
      body:='{}'::jsonb) $job$, v_url||'/functions/v1/task-reminders'));
END $$;
