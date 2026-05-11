-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: Remove self-referential RLS policies on organization_members and
--      organizations that cause "infinite recursion detected in policy"
--      errors throughout the app (automations save, Meta form connections,
--      session drops, etc.)
--
-- Root cause: the organization_members SELECT policy subqueried
-- organization_members itself, triggering infinite recursion whenever
-- ANY table with an org-membership check was accessed.
--
-- Fix: replace all recursive policies with simple auth.uid() = user_id.
-- All org reads use SECURITY DEFINER RPCs (get_my_organization,
-- get_organization_by_slug) which bypass RLS entirely, so simple
-- user-scoped policies are sufficient.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Drop ALL existing policies on organization_members ─────────────────────
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE tablename = 'organization_members' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.organization_members', pol.policyname);
  END LOOP;
END $$;

-- ── 2. Create simple, non-recursive policies on organization_members ───────────
-- Users can see their own membership rows only.
-- Cross-user views are handled via SECURITY DEFINER RPCs.
CREATE POLICY "org_members_select"
  ON public.organization_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "org_members_insert"
  ON public.organization_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "org_members_update"
  ON public.organization_members FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "org_members_delete"
  ON public.organization_members FOR DELETE
  USING (user_id = auth.uid());

-- ── 3. Drop ALL existing policies on organizations ────────────────────────────
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE tablename = 'organizations' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.organizations', pol.policyname);
  END LOOP;
END $$;

-- ── 4. Create simple policies on organizations ────────────────────────────────
-- SELECT: any authenticated user can read organizations
-- (org_by_slug lookups need this; actual membership is checked separately)
CREATE POLICY "organizations_select"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (true);

-- INSERT/UPDATE/DELETE: handled exclusively by service role (Edge Functions).
-- No PostgREST policies needed for writes — omit them to prevent any risk
-- of re-introducing recursion.
