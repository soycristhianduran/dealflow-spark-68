-- Registro de cada lead crudo que Meta entrega al webhook, para que ninguna
-- entrega pueda perderse en silencio. El cron de conciliación compara los
-- leads del formulario en Meta contra esta tabla y reprocesa los faltantes.
CREATE TABLE IF NOT EXISTS public.meta_lead_ingestions (
  leadgen_id      TEXT PRIMARY KEY,
  form_id         TEXT,
  page_id         TEXT,
  organization_id UUID,
  status          TEXT NOT NULL DEFAULT 'received', -- received|processed|error|assumed_processed|recovered
  error           TEXT,
  contact_id      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Solo el service role (webhook/cron) la usa; invisible para la app.
ALTER TABLE public.meta_lead_ingestions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_meta_lead_ingestions_form
  ON public.meta_lead_ingestions (form_id, created_at DESC);

-- Conciliación cada 15 minutos.
DO $$
DECLARE
  v_url TEXT := 'https://oqwcgvemrvimrdrzjzil.supabase.co';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — meta-lead-reconcile NOT scheduled.';
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'meta-lead-reconcile';

  PERFORM cron.schedule(
    'meta-lead-reconcile',
    '*/15 * * * *',
    format($job$
      SELECT net.http_post(
        url     := %L,
        headers := '{"Content-Type":"application/json","x-reconcile-key":"klosify-meta-reconcile-2026"}'::jsonb,
        body    := '{"action":"reconcile_leads"}'::jsonb,
        timeout_milliseconds := 55000
      ) AS request_id;
    $job$, v_url || '/functions/v1/facebook-webhook')
  );
  RAISE NOTICE '✓ meta-lead-reconcile scheduled every 15 minutes.';
END $$;
