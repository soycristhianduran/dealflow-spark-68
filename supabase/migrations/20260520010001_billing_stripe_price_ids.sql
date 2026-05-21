-- ============================================================================
-- Stripe price IDs — fill in after creating the products in Stripe Dashboard
-- ============================================================================
-- This migration is intentionally separate so you can re-run it (e.g. after
-- changing prices in Stripe) without re-applying the whole billing schema.
--
-- HOW TO FILL THIS IN:
--   1. Go to https://dashboard.stripe.com/products
--   2. Open each product (Starter, Pro, Business)
--   3. In the "Pricing" table on the product detail page, copy the price_id
--      for the monthly recurring price (e.g. "price_1Pxxxxxxxx...")
--   4. Copy the price_id for the yearly recurring price
--   5. Replace the REPLACE_ME values below
--   6. Run this migration in the Supabase SQL editor
-- ============================================================================

UPDATE public.plans
SET stripe_price_id_monthly = 'REPLACE_ME_starter_monthly',
    stripe_price_id_annual  = 'REPLACE_ME_starter_annual'
WHERE id = 'starter';

UPDATE public.plans
SET stripe_price_id_monthly = 'REPLACE_ME_pro_monthly',
    stripe_price_id_annual  = 'REPLACE_ME_pro_annual'
WHERE id = 'pro';

UPDATE public.plans
SET stripe_price_id_monthly = 'REPLACE_ME_business_monthly',
    stripe_price_id_annual  = 'REPLACE_ME_business_annual'
WHERE id = 'business';

-- Verify nothing is left as REPLACE_ME
DO $$
DECLARE
  v_missing INTEGER;
BEGIN
  SELECT count(*) INTO v_missing
  FROM public.plans
  WHERE stripe_price_id_monthly LIKE 'REPLACE_ME%'
     OR stripe_price_id_annual  LIKE 'REPLACE_ME%';

  IF v_missing > 0 THEN
    RAISE NOTICE '⚠️  % plan rows still have placeholder price IDs. Fix them before going live.', v_missing;
  ELSE
    RAISE NOTICE '✓ All plans have real Stripe price IDs.';
  END IF;
END $$;
