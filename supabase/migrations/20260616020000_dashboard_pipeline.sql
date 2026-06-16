CREATE OR REPLACE FUNCTION public.dashboard_pipeline(
  p_org uuid, p_vendor uuid DEFAULT NULL,
  p_start timestamptz DEFAULT NULL, p_end timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH f AS (
    SELECT stage_id, budget, budget_currency
    FROM contacts
    WHERE organization_id = p_org AND pipeline_id IS NOT NULL AND lead_status = 'active'
      AND (p_vendor IS NULL OR owner_id = p_vendor)
      AND (p_start IS NULL OR created_at >= p_start)
      AND (p_end IS NULL OR created_at < p_end)
  )
  SELECT jsonb_build_object(
    'count', (SELECT count(*) FROM f),
    'value', (SELECT coalesce(sum(budget), 0) FROM f),
    'currency', (SELECT budget_currency FROM f WHERE budget_currency IS NOT NULL GROUP BY budget_currency ORDER BY count(*) DESC LIMIT 1),
    'stages', (SELECT coalesce(jsonb_object_agg(stage_id, jsonb_build_object('count', cnt, 'value', val)), '{}'::jsonb)
               FROM (SELECT stage_id, count(*) cnt, coalesce(sum(budget),0) val FROM f WHERE stage_id IS NOT NULL GROUP BY stage_id) s)
  );
$$;
GRANT EXECUTE ON FUNCTION public.dashboard_pipeline(uuid, uuid, timestamptz, timestamptz) TO authenticated;
