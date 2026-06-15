-- Per-org report for the platform monitor. One efficient query (month-scoped).
CREATE OR REPLACE FUNCTION public.platform_org_report()
RETURNS TABLE (
  org_id                 UUID,
  org_name               TEXT,
  plan_id                TEXT,
  status                 TEXT,
  created_at             TIMESTAMPTZ,
  member_count           BIGINT,
  contact_count          BIGINT,
  ai_analyses_used       INTEGER,
  ai_objections_used     INTEGER,
  ai_assistant_used      INTEGER,
  ai_agent_credits_used  BIGINT,
  email_sends_used       INTEGER,
  landing_tokens_in      BIGINT,
  landing_tokens_out     BIGINT,
  agent_tokens_in        BIGINT,
  agent_tokens_out       BIGINT,
  agent_credit_balance   BIGINT,
  landing_credit_balance BIGINT,
  boost_balance          BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH mstart AS (SELECT date_trunc('month', NOW() AT TIME ZONE 'UTC') AS m)
  SELECT
    o.id, o.name, s.plan_id, s.status, o.created_at,
    (SELECT COUNT(*) FROM organization_members m WHERE m.organization_id = o.id),
    (SELECT COUNT(*) FROM contacts c WHERE c.organization_id = o.id),
    COALESCE(uc.ai_analyses_used, 0),
    COALESCE(uc.ai_objections_used, 0),
    COALESCE(uc.ai_assistant_used, 0),
    COALESCE(uc.ai_agent_credits_used, 0),
    COALESCE(uc.email_sends_used, 0),
    COALESCE((SELECT SUM(l.tokens_input)  FROM ia_landings_usage_log l WHERE l.organization_id = o.id AND l.created_at >= (SELECT m FROM mstart)), 0),
    COALESCE((SELECT SUM(l.tokens_output) FROM ia_landings_usage_log l WHERE l.organization_id = o.id AND l.created_at >= (SELECT m FROM mstart)), 0),
    COALESCE((SELECT SUM(a.tokens_input)  FROM ai_agent_sessions a WHERE a.organization_id = o.id AND a.date_utc >= (SELECT m FROM mstart)::date), 0),
    COALESCE((SELECT SUM(a.tokens_output) FROM ai_agent_sessions a WHERE a.organization_id = o.id AND a.date_utc >= (SELECT m FROM mstart)::date), 0),
    COALESCE((SELECT SUM(credits_remaining) FROM ia_agent_credits    g WHERE g.organization_id = o.id), 0),
    COALESCE((SELECT SUM(credits_remaining) FROM ia_landings_credits  g WHERE g.organization_id = o.id), 0),
    COALESCE((SELECT SUM(credits_remaining) FROM ai_boost_credits     g WHERE g.organization_id = o.id), 0)
  FROM organizations o
  JOIN subscriptions s ON s.organization_id = o.id
  LEFT JOIN usage_counters uc
    ON uc.organization_id = o.id AND uc.period_start = (SELECT m FROM mstart)
  ORDER BY o.created_at ASC;
$$;
GRANT EXECUTE ON FUNCTION public.platform_org_report() TO service_role;
