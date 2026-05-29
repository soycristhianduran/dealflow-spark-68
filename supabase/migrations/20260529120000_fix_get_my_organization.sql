-- ============================================================================
-- Fix get_my_organization() return shape
-- ============================================================================
-- The security hardening migration (20260529100000) changed get_my_organization()
-- to RETURNS SETOF public.organizations.  That broke useOrganization.ts which
-- reads the original aliased columns: organization_id, org_name, org_slug,
-- member_role.  This migration restores the JOIN-based shape that the front-end
-- expects while keeping the security DEFINER / org-scoped guarantee.
-- ============================================================================

-- Drop both overloads that may exist from previous migrations
DROP FUNCTION IF EXISTS public.get_my_organization() CASCADE;

CREATE OR REPLACE FUNCTION public.get_my_organization()
RETURNS TABLE (
  organization_id  UUID,
  org_name         TEXT,
  org_slug         TEXT,
  member_role      TEXT,
  -- also expose canonical columns so any code reading .id / .name / .slug works
  id               UUID,
  name             TEXT,
  slug             TEXT,
  created_at       TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    o.id         AS organization_id,
    o.name       AS org_name,
    o.slug       AS org_slug,
    m.role       AS member_role,
    o.id,
    o.name,
    o.slug,
    o.created_at
  FROM  public.organizations      o
  JOIN  public.organization_members m ON m.organization_id = o.id
  WHERE m.user_id = auth.uid()
  ORDER BY m.created_at ASC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_organization() TO authenticated;

-- ============================================================================
-- Also fix get_organization_by_slug(text) — same change in that migration
-- replaced a RETURNS TABLE shape with RETURNS SETOF organizations, and the
-- front-end reads row.organization_id / row.org_name from it too.
-- ============================================================================
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
  created_at       TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    o.id         AS organization_id,
    o.name       AS org_name,
    o.slug       AS org_slug,
    m.role       AS member_role,
    o.id,
    o.name,
    o.slug,
    o.created_at
  FROM  public.organizations      o
  JOIN  public.organization_members m ON m.organization_id = o.id
  WHERE o.slug    = p_slug
    AND m.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_by_slug(TEXT) TO authenticated;
