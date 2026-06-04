-- ── Atomic landing credit deduction ─────────────────────────────────────────
-- Replaces the read-modify-write pattern (race condition) in the edge function
-- with a single server-side UPDATE + RETURNING, making deductions safe under
-- concurrent calls.
--
-- Parameters:
--   p_credit_id  uuid     — the ia_landings_credits row to deduct from
--   p_tokens     integer  — tokens to deduct (floored at 0)
--
-- Returns: new credits_remaining value (integer)

CREATE OR REPLACE FUNCTION deduct_landing_credits(
  p_credit_id uuid,
  p_tokens    integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining integer;
BEGIN
  UPDATE ia_landings_credits
  SET
    credits_remaining = GREATEST(0, credits_remaining - p_tokens),
    updated_at        = now()
  WHERE id = p_credit_id
  RETURNING credits_remaining INTO v_remaining;

  RETURN COALESCE(v_remaining, 0);
END;
$$;

-- Allow service_role (edge functions) to call it
GRANT EXECUTE ON FUNCTION deduct_landing_credits(uuid, integer) TO service_role;
