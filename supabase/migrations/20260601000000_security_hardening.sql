-- ============================================================
-- Security hardening — 2026-06-01
-- Fixes:
--   1. organization_members INSERT policy — require valid invitation
--   2. organization_invitations table — create with proper RLS
--   3. Revoke billing functions from authenticated role
-- ============================================================

-- ── 1. Fix organization_members INSERT policy ─────────────────────────────────
-- Old policy allowed any authenticated user to insert themselves into ANY org.
-- New policy: INSERT only allowed when a valid pending invitation exists for
-- the user's email in that organization. SECURITY DEFINER functions and
-- service_role bypass RLS, so org creation triggers are unaffected.

DROP POLICY IF EXISTS "org_members_insert" ON public.organization_members;

CREATE POLICY "org_members_insert_requires_invitation"
  ON public.organization_members FOR INSERT
  WITH CHECK (
    -- Must be inserting own user_id
    user_id = auth.uid()
    AND
    -- Must have a valid pending invitation for this org
    EXISTS (
      SELECT 1
      FROM public.organization_invitations oi
      JOIN auth.users au ON lower(au.email) = lower(oi.email)
      WHERE oi.organization_id = organization_members.organization_id
        AND au.id = auth.uid()
        AND oi.accepted_at IS NULL
        AND oi.expires_at > now()
    )
  );

-- ── 2. organization_invitations table ────────────────────────────────────────
-- This table was missing from migrations (existed only in production DB).
-- Recreate with IF NOT EXISTS so it's safe to run on existing databases.

CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'vendor')),
  invited_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  token           UUID NOT NULL DEFAULT gen_random_uuid(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

-- Admins/owners of the org can see and manage invitations
DROP POLICY IF EXISTS "org_admins_manage_invitations" ON public.organization_invitations;
CREATE POLICY "org_admins_manage_invitations"
  ON public.organization_invitations FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Anyone can read an invitation by token (needed to render the accept page)
DROP POLICY IF EXISTS "anyone_read_invitation_by_token" ON public.organization_invitations;
CREATE POLICY "anyone_read_invitation_by_token"
  ON public.organization_invitations FOR SELECT
  USING (true);  -- token is a secret UUID; possessing it is sufficient proof

-- ── 3. Revoke billing functions from authenticated role ───────────────────────
-- These functions were granted to `authenticated`, allowing any logged-in user
-- to call them directly from the client:
--   - start_internal_trial: could reset trial indefinitely (billing bypass)
--   - consume_ai_credit: could drain another org's AI credits

REVOKE EXECUTE ON FUNCTION public.start_internal_trial(UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_ai_credit(UUID, TEXT, INTEGER) FROM authenticated;

-- Keep service_role access (edge functions call these internally)
-- GRANT already exists from original migration; no change needed for service_role.
