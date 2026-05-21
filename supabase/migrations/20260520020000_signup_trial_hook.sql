-- ============================================================================
-- Auto-create 14-day Pro trial when an organization is created
-- ============================================================================
-- Hooks into the `organizations` INSERT to call start_internal_trial().
-- This means: every new workspace gets the trial automatically without the
-- frontend having to call anything explicitly. Idempotent (start_internal_trial
-- skips if a subscription already exists).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.organizations_start_trial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fire and forget. Errors here MUST NOT block the org creation.
  BEGIN
    PERFORM public.start_internal_trial(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'start_internal_trial failed for org %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_start_trial ON public.organizations;
CREATE TRIGGER organizations_start_trial
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.organizations_start_trial();

-- Also backfill: for existing organizations that don't have a subscription
-- yet (your current dev workspaces), give them a trial too. The trial starts
-- from NOW, which is fine — these are your test orgs, not real customers.
DO $$
DECLARE
  org_record RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR org_record IN
    SELECT o.id FROM public.organizations o
    LEFT JOIN public.subscriptions s ON s.organization_id = o.id
    WHERE s.id IS NULL
  LOOP
    PERFORM public.start_internal_trial(org_record.id);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Backfilled trials for % existing organizations', v_count;
END $$;
