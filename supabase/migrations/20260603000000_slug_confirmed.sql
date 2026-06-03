-- ============================================================================
-- slug_confirmed: gate new users until they explicitly save their workspace URL
-- ============================================================================
-- New users created by handle_new_user_trigger get an auto-generated slug
-- (from company_name or full_name).  They must visit Configuración → General
-- and click "Guardar" before accessing the rest of the app.
--
-- slug_confirmed = false  → WorkspaceEntryPage redirects all routes to /settings
-- slug_confirmed = true   → normal access
-- ============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS slug_confirmed BOOLEAN NOT NULL DEFAULT false;

-- All existing orgs have already been set up — mark them confirmed.
UPDATE public.organizations SET slug_confirmed = true WHERE slug_confirmed = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- Re-create get_my_organization() adding slug_confirmed to the return shape
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_my_organization() CASCADE;

CREATE OR REPLACE FUNCTION public.get_my_organization()
RETURNS TABLE (
  organization_id  UUID,
  org_name         TEXT,
  org_slug         TEXT,
  member_role      TEXT,
  id               UUID,
  name             TEXT,
  slug             TEXT,
  created_at       TIMESTAMPTZ,
  slug_confirmed   BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    o.id          AS organization_id,
    o.name        AS org_name,
    o.slug        AS org_slug,
    m.role        AS member_role,
    o.id,
    o.name,
    o.slug,
    o.created_at,
    o.slug_confirmed
  FROM  public.organizations       o
  JOIN  public.organization_members m ON m.organization_id = o.id
  WHERE m.user_id = auth.uid()
  ORDER BY m.created_at ASC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_organization() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Re-create get_organization_by_slug() adding slug_confirmed
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_organization_by_slug(TEXT) CASCADE;

CREATE OR REPLACE FUNCTION public.get_organization_by_slug(p_slug TEXT)
RETURNS TABLE (
  organization_id  UUID,
  org_name         TEXT,
  org_slug         TEXT,
  member_role      TEXT,
  id               UUID,
  name             TEXT,
  slug             TEXT,
  created_at       TIMESTAMPTZ,
  slug_confirmed   BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    o.id          AS organization_id,
    o.name        AS org_name,
    o.slug        AS org_slug,
    m.role        AS member_role,
    o.id,
    o.name,
    o.slug,
    o.created_at,
    o.slug_confirmed
  FROM  public.organizations       o
  JOIN  public.organization_members m ON m.organization_id = o.id
  WHERE o.slug    = p_slug
    AND m.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_by_slug(TEXT) TO authenticated;
