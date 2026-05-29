-- ============================================================================
-- Security Hardening
-- ============================================================================
-- Fixes 6 security issues found in the multi-tenant isolation audit:
--
--  #1  organizations  — SELECT USING (true) → restrict to own org only
--                       SECURITY DEFINER RPCs handle slug lookup at login
--  #2  contact_ai_analyses — user-scoped → org-scoped via contacts
--  #3  facebook_pages     — user-scoped → org-scoped (org_id col exists)
--  #4  facebook_lead_forms — user-scoped, no org_id → add col, org-scope
--  #5  facebook_field_mappings — user-scoped, no org_id → add col, org-scope
--  #6  api_rate_limits table — enables rate limiting in the public-api
--                              Edge Function (100 req/min per API key)
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SECURITY DEFINER RPCs for org lookup (must exist BEFORE we tighten RLS)
-- ─────────────────────────────────────────────────────────────────────────────
-- These functions bypass RLS intentionally: they're the authoritative,
-- audited path for reading org data. All other reads go through RLS.

-- Returns the organizations the current user belongs to
DROP FUNCTION IF EXISTS public.get_my_organization() CASCADE;
CREATE OR REPLACE FUNCTION public.get_my_organization()
RETURNS SETOF public.organizations
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT o.*
  FROM public.organizations o
  JOIN public.organization_members m ON m.organization_id = o.id
  WHERE m.user_id = auth.uid()
  ORDER BY m.created_at ASC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_organization() TO authenticated;

-- Returns a single organization by slug (used on WorkspaceEntryPage before
-- the user has authenticated into that org — must bypass RLS)
DROP FUNCTION IF EXISTS public.get_organization_by_slug(TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.get_organization_by_slug(p_slug TEXT)
RETURNS SETOF public.organizations
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT * FROM public.organizations WHERE slug = p_slug LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_by_slug(TEXT) TO authenticated, anon;

COMMENT ON FUNCTION public.get_my_organization() IS
  'SECURITY DEFINER: returns the organizations the current user belongs to. Bypasses RLS on organizations to avoid recursion.';
COMMENT ON FUNCTION public.get_organization_by_slug(TEXT) IS
  'SECURITY DEFINER: returns a single org by slug for the workspace login page. Accessible pre-authentication.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fix organizations SELECT policy (tenant enumeration vulnerability)
-- ─────────────────────────────────────────────────────────────────────────────
-- Before: USING (true) — any authenticated user could list ALL tenants.
-- After:  USING (id IN get_my_organization_ids()) — own orgs only.
-- The SECURITY DEFINER RPCs above handle the two cases that need cross-org
-- reads: slug lookup (anon/pre-login) and org onboarding flows.

-- Drop the open policy added by 20260514000000_fix_rls_infinite_recursion
DROP POLICY IF EXISTS "organizations_select" ON public.organizations;

CREATE POLICY "organizations_own_only"
  ON public.organizations FOR SELECT TO authenticated
  USING (id IN (SELECT public.get_my_organization_ids()));

-- No INSERT/UPDATE/DELETE from the client — only service_role (Edge Functions)
-- manages org rows. Existing lack of those policies is correct.

COMMENT ON POLICY "organizations_own_only" ON public.organizations IS
  'Restricts org reads to own tenants. Slug lookup and login flows use get_organization_by_slug() SECURITY DEFINER RPC instead.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Fix contact_ai_analyses: user-scoped → org-scoped
-- ─────────────────────────────────────────────────────────────────────────────
-- Before: USING (auth.uid() = user_id)
-- Issue:  teammates can't see AI analyses; wrong isolation boundary
-- After:  scoped to org via the related contact's organization_id

DROP POLICY IF EXISTS "contact_ai_analyses_own" ON public.contact_ai_analyses;

CREATE POLICY "contact_ai_analyses_org"
  ON public.contact_ai_analyses FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = contact_ai_analyses.contact_id
        AND c.organization_id IN (SELECT public.get_my_organization_ids())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = contact_ai_analyses.contact_id
        AND c.organization_id IN (SELECT public.get_my_organization_ids())
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Fix facebook_pages: user-scoped → org-scoped
-- ─────────────────────────────────────────────────────────────────────────────
-- The column organization_id already exists on facebook_pages.
-- Backfill any rows that might still be NULL.

UPDATE public.facebook_pages fp
SET organization_id = m.organization_id
FROM public.organization_members m
WHERE fp.organization_id IS NULL
  AND fp.user_id IS NOT NULL
  AND m.user_id = fp.user_id;

DROP POLICY IF EXISTS "Users manage own fb pages" ON public.facebook_pages;

CREATE POLICY "facebook_pages_org"
  ON public.facebook_pages FOR ALL TO authenticated
  USING (organization_id IN (SELECT public.get_my_organization_ids()))
  WITH CHECK (organization_id IN (SELECT public.get_my_organization_ids()));


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Fix facebook_lead_forms: add organization_id, upgrade to org-scoped
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.facebook_lead_forms
  ADD COLUMN IF NOT EXISTS organization_id UUID
  REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_facebook_lead_forms_org
  ON public.facebook_lead_forms(organization_id);

UPDATE public.facebook_lead_forms flf
SET organization_id = m.organization_id
FROM public.organization_members m
WHERE flf.organization_id IS NULL
  AND flf.user_id IS NOT NULL
  AND m.user_id = flf.user_id;

DROP POLICY IF EXISTS "Users manage own fb forms" ON public.facebook_lead_forms;

CREATE POLICY "facebook_lead_forms_org"
  ON public.facebook_lead_forms FOR ALL TO authenticated
  USING (organization_id IN (SELECT public.get_my_organization_ids()))
  WITH CHECK (organization_id IN (SELECT public.get_my_organization_ids()));


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Fix facebook_field_mappings: add organization_id, upgrade to org-scoped
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.facebook_field_mappings
  ADD COLUMN IF NOT EXISTS organization_id UUID
  REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_facebook_field_mappings_org
  ON public.facebook_field_mappings(organization_id);

UPDATE public.facebook_field_mappings ffm
SET organization_id = m.organization_id
FROM public.organization_members m
WHERE ffm.organization_id IS NULL
  AND ffm.user_id IS NOT NULL
  AND m.user_id = ffm.user_id;

DROP POLICY IF EXISTS "Users manage own fb field mappings" ON public.facebook_field_mappings;

-- facebook_field_mappings had no explicit RLS policy name in migrations
-- Drop any stray policy and recreate clean
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'facebook_field_mappings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.facebook_field_mappings', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.facebook_field_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "facebook_field_mappings_org"
  ON public.facebook_field_mappings FOR ALL TO authenticated
  USING (organization_id IN (SELECT public.get_my_organization_ids()))
  WITH CHECK (organization_id IN (SELECT public.get_my_organization_ids()));


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Rate limiting table for public-api Edge Function
-- ─────────────────────────────────────────────────────────────────────────────
-- Stores per-API-key request counts in 1-minute windows.
-- The Edge Function checks + increments on every request.
-- Rows older than 5 minutes are irrelevant and can be pruned by a cron.

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key_id       UUID        NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,               -- truncated to minute
  req_count    INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, window_start)
);

-- No RLS needed — only accessed by service_role (Edge Function)
-- But enable it defensively so anon/authed can't read rate limit data
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies → only service_role can access

CREATE INDEX IF NOT EXISTS idx_rate_limits_window
  ON public.api_rate_limits(window_start);

COMMENT ON TABLE public.api_rate_limits IS
  'Per-API-key sliding-window request counters. Checked by the public-api Edge Function. Max 100 req/min per key.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. increment_rate_limit — atomic upsert called by the Edge Function
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns TRUE if the request is allowed, FALSE if the limit was exceeded.
-- Uses ON CONFLICT DO UPDATE to atomically increment the counter.

CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  p_key_id       UUID,
  p_window_start TIMESTAMPTZ,
  p_limit        INTEGER DEFAULT 100
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.api_rate_limits(key_id, window_start, req_count)
  VALUES (p_key_id, p_window_start, 1)
  ON CONFLICT (key_id, window_start)
  DO UPDATE SET req_count = api_rate_limits.req_count + 1
  RETURNING req_count INTO v_count;

  -- Also lazily prune stale rows (older than 10 min)
  DELETE FROM public.api_rate_limits
  WHERE window_start < now() - INTERVAL '10 minutes';

  RETURN v_count <= p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_rate_limit(UUID, TIMESTAMPTZ, INTEGER) TO service_role;

COMMENT ON FUNCTION public.increment_rate_limit IS
  'Atomically increments the request counter for the given API key + time window. Returns FALSE when the per-minute limit is exceeded.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Cleanup function for stale rate-limit rows (called by cron or lazily)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.api_rate_limits
  WHERE window_start < now() - INTERVAL '10 minutes';
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits() TO service_role;
