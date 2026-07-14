-- El reporte de plataforma contaba a los gestores como usuarios del plan,
-- inflando "usuarios vs máximo". Los gestores son staff NO facturable (no ocupan
-- silla: ver enforce_member_limit y org-invitations). Se excluyen aquí también
-- para que member_count refleje solo usuarios facturables, consistente con el
-- resto del sistema y con platform_list_organizations().
CREATE OR REPLACE FUNCTION public.platform_org_report()
 RETURNS TABLE(org_id uuid, org_name text, plan_id text, status text, created_at timestamp with time zone, member_count bigint, contact_count bigint, ai_analyses_used integer, ai_objections_used integer, ai_assistant_used integer, ai_agent_credits_used bigint, email_sends_used integer, landing_tokens_in bigint, landing_tokens_out bigint, agent_tokens_in bigint, agent_tokens_out bigint, agent_credit_balance bigint, landing_credit_balance bigint, boost_balance bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH mstart AS (SELECT date_trunc('month', NOW() AT TIME ZONE 'UTC') AS m)
  SELECT
    o.id, o.name, s.plan_id, s.status, o.created_at,
    (SELECT COUNT(*) FROM organization_members m WHERE m.organization_id = o.id AND m.role <> 'gestor'),
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
$function$;
