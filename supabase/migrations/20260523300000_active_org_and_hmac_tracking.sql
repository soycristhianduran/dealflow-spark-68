-- ============================================================================
-- Fix #5: Multi-org user always inserts into correct workspace
-- ============================================================================
-- Problem: auth_user_org_id() picks the org the user joined FIRST. If a user
-- is a member of two orgs (owner of org A, invited to org B), new rows
-- created while browsing org B's workspace still land in org A.
--
-- Fix: add last_active_at to organization_members. The frontend calls
-- touch_active_org(org_id) when loading a workspace. auth_user_org_id()
-- is updated to ORDER BY last_active_at DESC so the most recently visited
-- workspace wins.
-- ============================================================================

-- 1. Add last_active_at column
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT now();

-- Seed: set last_active_at = created_at so existing rows get a real value
UPDATE public.organization_members
  SET last_active_at = created_at
  WHERE last_active_at IS NULL;

-- Index for the ORDER BY in auth_user_org_id()
CREATE INDEX IF NOT EXISTS idx_org_members_user_last_active
  ON public.organization_members(user_id, last_active_at DESC);


-- 2. touch_active_org — called by the frontend when entering a workspace
--    Updates last_active_at for the current user in the given org so that
--    auth_user_org_id() returns that org on subsequent INSERT triggers.
CREATE OR REPLACE FUNCTION public.touch_active_org(p_org_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.organization_members
  SET    last_active_at = now()
  WHERE  user_id        = auth.uid()
    AND  organization_id = p_org_id;
$$;

GRANT EXECUTE ON FUNCTION public.touch_active_org(UUID) TO authenticated;

COMMENT ON FUNCTION public.touch_active_org(UUID) IS
  'Called by the frontend when the user enters a workspace. Updates
   last_active_at so that auth_user_org_id() returns the right org for
   multi-org users. Single-org users are unaffected.';


-- 3. Update auth_user_org_id() to prefer most-recently-active org
CREATE OR REPLACE FUNCTION public.auth_user_org_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT organization_id
  FROM   public.organization_members
  WHERE  user_id = auth.uid()
  ORDER  BY last_active_at DESC NULLS LAST,
            created_at     ASC  NULLS LAST
  LIMIT  1;
$$;

COMMENT ON FUNCTION public.auth_user_org_id() IS
  'Returns the organization_id of the currently authenticated user.
   Prefers the most recently touched workspace (last_active_at DESC) so
   multi-org users always write to the workspace they navigated to last.
   Falls back to the oldest membership for users who never called
   touch_active_org().';
