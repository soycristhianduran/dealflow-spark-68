-- ============================================================
-- Fix infinite recursion in org_members_view_same_org policy
-- ============================================================
-- The org_members_view_same_org SELECT policy on organization_members
-- queries organization_members recursively, which causes:
--   "ERROR: infinite recursion detected in policy for relation organization_members"
-- when evaluated from the client side (authenticated user context).
--
-- Fix: use a SECURITY DEFINER function to read the user's org IDs
-- without triggering RLS on organization_members again.
-- ============================================================

-- Helper: returns all org IDs the caller belongs to (bypasses RLS to avoid recursion)
CREATE OR REPLACE FUNCTION get_my_organization_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT organization_id
  FROM organization_members
  WHERE user_id = auth.uid();
$$;

-- Fix: replace recursive policy with function-based one (no recursion)
DROP POLICY IF EXISTS "org_members_view_same_org" ON public.organization_members;
CREATE POLICY "org_members_view_same_org"
ON public.organization_members FOR SELECT
TO authenticated
USING (
  organization_id IN (SELECT get_my_organization_ids())
);

-- Fix: update profiles_view_same_org to use the same function
DROP POLICY IF EXISTS "profiles_view_same_org" ON public.profiles;
CREATE POLICY "profiles_view_same_org"
ON public.profiles FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT om.user_id
    FROM organization_members om
    WHERE om.organization_id IN (SELECT get_my_organization_ids())
  )
);

-- Fix: update webhook_subscriptions policy to use the function
DROP POLICY IF EXISTS "org_members_manage_webhooks" ON public.webhook_subscriptions;
CREATE POLICY "org_members_manage_webhooks"
ON public.webhook_subscriptions FOR ALL
TO authenticated
USING (
  organization_id IN (SELECT get_my_organization_ids())
)
WITH CHECK (
  organization_id IN (SELECT get_my_organization_ids())
);
