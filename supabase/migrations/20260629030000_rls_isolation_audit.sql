-- Data-isolation safety net
-- ---------------------------------------------------------------------------
-- 1. Secure a diagnostic table that was created with RLS off (it has an
--    organization_id, so without RLS it was readable across orgs).
ALTER TABLE public.ai_agent_debug ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_agent_debug_org_select ON public.ai_agent_debug;
CREATE POLICY ai_agent_debug_org_select ON public.ai_agent_debug
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- 2. audit_rls_isolation() — platform-admin guard that flags any org-scoped
--    table (has an organization_id column) that is either missing RLS or has a
--    permissive (USING true) read policy. Auto-covers future tables. An empty
--    result means data isolation is intact. RLS-on-with-no-policy is deny-all
--    (secure) and is intentionally NOT reported.
CREATE OR REPLACE FUNCTION public.audit_rls_isolation()
RETURNS TABLE(table_name TEXT, issue TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_platform_admin' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  WITH org_tables AS (
    SELECT c.relname AS t, c.oid, c.relrowsecurity AS rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE c.relkind = 'r'
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped)
  )
  SELECT ot.t::TEXT, 'RLS DESACTIVADA — tabla leible entre organizaciones'::TEXT
    FROM org_tables ot WHERE ot.rls = false
  UNION ALL
  SELECT DISTINCT ot.t::TEXT, ('POLITICA PERMISIVA (USING true): ' || p.policyname)::TEXT
    FROM org_tables ot
    JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = ot.t
    WHERE p.cmd IN ('SELECT', 'ALL') AND (p.qual IS NULL OR btrim(lower(p.qual)) = 'true');
END;
$function$;
GRANT EXECUTE ON FUNCTION public.audit_rls_isolation() TO authenticated;
