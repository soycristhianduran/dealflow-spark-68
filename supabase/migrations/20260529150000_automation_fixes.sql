-- ============================================================
-- Automation system fixes
--   1. inc_email_campaign_clicked RPC (for track-email)
--   2. organization_id column on automation_enrollments
-- ============================================================

-- ── 1. inc_email_campaign_clicked ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.inc_email_campaign_clicked(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.email_campaigns
  SET clicked_count = clicked_count + 1, updated_at = now()
  WHERE id = p_campaign_id;
END;
$$;

-- ── 2. Add organization_id to automation_enrollments ──────────────────────────
ALTER TABLE public.automation_enrollments
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Backfill: populate from the automations table
UPDATE public.automation_enrollments ae
SET organization_id = a.organization_id
FROM public.automations a
WHERE ae.automation_id = a.id
  AND ae.organization_id IS NULL;

-- Index for efficient org-scoped queries
CREATE INDEX IF NOT EXISTS idx_automation_enrollments_org_id
  ON public.automation_enrollments (organization_id);

-- Update RLS: drop the old user-only policy, keep org-based policy
DROP POLICY IF EXISTS "Users manage own automation_enrollments" ON public.automation_enrollments;

-- Ensure the org-based policy covers service-role writes (enrollment from edge function)
-- The "Org members manage enrollments" policy already handles authenticated users.
-- Add a service_role bypass so automation-runner can write without JWT:
ALTER TABLE public.automation_enrollments ENABLE ROW LEVEL SECURITY;

-- Policy: org members can manage enrollments (SELECT / INSERT / UPDATE / DELETE)
DROP POLICY IF EXISTS "Org members manage enrollments" ON public.automation_enrollments;
CREATE POLICY "Org members manage enrollments"
  ON public.automation_enrollments
  FOR ALL
  USING (
    automation_id IN (
      SELECT id FROM public.automations
      WHERE organization_id IN (
        SELECT organization_id FROM public.organization_members
        WHERE user_id = auth.uid()
      )
    )
  );
