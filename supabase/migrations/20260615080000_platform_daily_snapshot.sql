-- ─────────────────────────────────────────────────────────────────────────────
-- Daily platform snapshot — turns the live monitor into a history/trend so you
-- can see cost evolution and catch spikes day-over-day. Computed entirely in SQL
-- and scheduled with pg_cron (runs 00:05 UTC daily). Stores month-to-date values.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_daily_stats (
  snapshot_date  DATE        PRIMARY KEY,
  total_orgs     INTEGER,
  active_orgs    INTEGER,
  mrr_usd        NUMERIC,
  ai_cost_usd    NUMERIC,
  ai_breakdown   JSONB,
  resend_emails  BIGINT,
  db_size_gb     NUMERIC,
  infra_cost_usd NUMERIC,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.platform_daily_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_admins_read_daily" ON public.platform_daily_stats;
CREATE POLICY "platform_admins_read_daily"
  ON public.platform_daily_stats FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.take_platform_snapshot()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_m          TIMESTAMPTZ := date_trunc('month', NOW() AT TIME ZONE 'UTC');
  v_active     TEXT[] := ARRAY['active','trialing','trialing_internal'];
  v_total      INTEGER; v_act INTEGER; v_mrr NUMERIC;
  v_agent      NUMERIC; v_land NUMERIC; v_log NUMERIC; v_email BIGINT; v_db NUMERIC;
BEGIN
  SELECT COUNT(*) , COUNT(*) FILTER (WHERE s.status = ANY(v_active))
    INTO v_total, v_act
  FROM subscriptions s;

  SELECT COALESCE(SUM(p.monthly_price_usd), 0) INTO v_mrr
  FROM subscriptions s JOIN plans p ON p.id = s.plan_id
  WHERE s.status = ANY(v_active);

  SELECT COALESCE(ai_agent_token_cost_usd(SUM(tokens_input)::bigint, SUM(tokens_output)::bigint), 0)
    INTO v_agent FROM ai_agent_sessions WHERE date_utc >= v_m::date;

  SELECT COALESCE(landing_token_cost_usd(SUM(tokens_input)::bigint, SUM(tokens_output)::bigint), 0)
    INTO v_land FROM ia_landings_usage_log WHERE created_at >= v_m;

  SELECT COALESCE(SUM(cost_usd), 0) INTO v_log FROM ai_usage_cost_report();

  SELECT COALESCE(SUM(email_sends_used), 0) INTO v_email
  FROM usage_counters WHERE period_start = v_m;

  v_db := pg_database_size(current_database())::numeric / 1e9;

  INSERT INTO public.platform_daily_stats
    (snapshot_date, total_orgs, active_orgs, mrr_usd, ai_cost_usd, ai_breakdown, resend_emails, db_size_gb, infra_cost_usd)
  VALUES (
    (NOW() AT TIME ZONE 'UTC')::date, v_total, v_act, v_mrr,
    ROUND(v_agent + v_land + v_log, 2),
    jsonb_build_object('agent', ROUND(v_agent,2), 'landings', ROUND(v_land,2), 'usage_log', ROUND(v_log,2)),
    v_email, ROUND(v_db, 3),
    ROUND(v_agent + v_land + v_log + CASE WHEN v_email <= 3000 THEN 0 WHEN v_email <= 50000 THEN 20 ELSE 90 END, 2)
  )
  ON CONFLICT (snapshot_date) DO UPDATE SET
    total_orgs = EXCLUDED.total_orgs, active_orgs = EXCLUDED.active_orgs, mrr_usd = EXCLUDED.mrr_usd,
    ai_cost_usd = EXCLUDED.ai_cost_usd, ai_breakdown = EXCLUDED.ai_breakdown,
    resend_emails = EXCLUDED.resend_emails, db_size_gb = EXCLUDED.db_size_gb,
    infra_cost_usd = EXCLUDED.infra_cost_usd, created_at = NOW();
END;
$$;
GRANT EXECUTE ON FUNCTION public.take_platform_snapshot() TO service_role;

-- Schedule daily at 00:05 UTC.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.unschedule('platform-daily-snapshot')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'platform-daily-snapshot');
SELECT cron.schedule('platform-daily-snapshot', '5 0 * * *', $$SELECT public.take_platform_snapshot();$$);
