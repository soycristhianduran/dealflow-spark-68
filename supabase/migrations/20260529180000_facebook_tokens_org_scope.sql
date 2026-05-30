-- ============================================================
-- Scope facebook_tokens to organization (multi-tenant SaaS fix)
-- Previously keyed by user_id only — a user in two orgs would
-- share the same Facebook token across both orgs.
-- ============================================================

-- 1. Add organization_id column (nullable initially for backward compat)
ALTER TABLE public.facebook_tokens
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 2. Backfill from organization_members (take first/primary org per user)
UPDATE public.facebook_tokens ft
SET    organization_id = om.organization_id
FROM   public.organization_members om
WHERE  om.user_id = ft.user_id
AND    ft.organization_id IS NULL
AND    om.organization_id = (
         SELECT organization_id
         FROM   public.organization_members
         WHERE  user_id = ft.user_id
         ORDER  BY created_at
         LIMIT  1
       );

-- 3. Index for fast per-org lookups
CREATE INDEX IF NOT EXISTS idx_facebook_tokens_org
  ON public.facebook_tokens (organization_id)
  WHERE organization_id IS NOT NULL;

-- 4. Add org-scoped RLS policy alongside the existing user policy
--    (keep user policy so the edge functions that use user_id still work)
DROP POLICY IF EXISTS "Org members manage fb tokens" ON public.facebook_tokens;
CREATE POLICY "Org members manage fb tokens"
  ON public.facebook_tokens FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id
      FROM   public.organization_members
      WHERE  user_id = auth.uid()
    )
    OR auth.uid() = user_id  -- fallback for rows without org yet
  );
