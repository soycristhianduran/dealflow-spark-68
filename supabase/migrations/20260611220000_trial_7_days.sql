-- Shorten the free trial from 14 days to 7 days.
--
-- Policy: new organizations get a 7-day Pro trial; after that they must pay to
-- keep using the app (enforced by the lockout once the trial expires / status is
-- canceled). start_internal_trial() is the single source of truth for new-org
-- trials (the Stripe checkout flow preserves the trial_ends_at it sets). The
-- trial-reminder cron is relative to trial_ends_at, so it adapts automatically.

CREATE OR REPLACE FUNCTION public.start_internal_trial(p_org_id UUID)
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions;
BEGIN
  -- Already has a subscription? Return it.
  SELECT * INTO v_sub FROM public.subscriptions WHERE organization_id = p_org_id;
  IF FOUND THEN
    RETURN v_sub;
  END IF;

  INSERT INTO public.subscriptions (
    organization_id, plan_id, status,
    trial_ends_at,
    current_period_start, current_period_end
  ) VALUES (
    p_org_id, 'pro', 'trialing_internal',
    NOW() + INTERVAL '7 days',
    NOW(), NOW() + INTERVAL '7 days'
  )
  RETURNING * INTO v_sub;

  -- Seed the first usage counter row
  INSERT INTO public.usage_counters (organization_id, period_start, period_end)
  VALUES (p_org_id, date_trunc('month', NOW()), date_trunc('month', NOW()) + INTERVAL '1 month')
  ON CONFLICT (organization_id, period_start) DO NOTHING;

  RETURN v_sub;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_internal_trial(UUID) TO authenticated, service_role;
