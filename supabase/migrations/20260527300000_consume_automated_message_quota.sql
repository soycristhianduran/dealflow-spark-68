-- consume_automated_message_quota(org_id, amount)
-- Atomic counter increment for automated messages sent via automation-runner.
-- Returns TRUE if the org has budget (counter incremented).
-- Returns FALSE if over the monthly limit (blocks sending).
-- NULL plan limit = unlimited.

CREATE OR REPLACE FUNCTION public.consume_automated_message_quota(
  p_org_id UUID,
  p_amount INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit        INTEGER;
  v_used         INTEGER;
  v_period_start TIMESTAMPTZ;
  v_period_end   TIMESTAMPTZ;
BEGIN
  -- Resolve the org's plan limit for automated messages
  SELECT p.monthly_automated_messages
  INTO v_limit
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = p_org_id
    AND s.status IN ('trialing_internal', 'trialing', 'active');

  IF NOT FOUND THEN
    RETURN FALSE; -- no active subscription
  END IF;

  -- NULL = unlimited, always allow
  IF v_limit IS NULL THEN
    RETURN TRUE;
  END IF;

  v_period_start := date_trunc('month', NOW());
  v_period_end   := v_period_start + INTERVAL '1 month';

  -- Upsert counter row
  INSERT INTO public.usage_counters (organization_id, period_start, period_end)
  VALUES (p_org_id, v_period_start, v_period_end)
  ON CONFLICT (organization_id, period_start) DO NOTHING;

  -- Read current usage with row lock
  SELECT automated_messages_used
  INTO v_used
  FROM public.usage_counters
  WHERE organization_id = p_org_id AND period_start = v_period_start
  FOR UPDATE;

  -- Under the limit? Increment and allow.
  IF v_used + p_amount <= v_limit THEN
    UPDATE public.usage_counters
      SET automated_messages_used = automated_messages_used + p_amount,
          updated_at = NOW()
      WHERE organization_id = p_org_id AND period_start = v_period_start;
    RETURN TRUE;
  END IF;

  -- Over the limit
  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_automated_message_quota(UUID, INTEGER) TO service_role;
