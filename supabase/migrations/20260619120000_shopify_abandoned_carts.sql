-- ============================================================
-- Shopify abandoned carts → automation trigger ("abandoned_cart")
--
-- Stores abandoned checkouts pulled from Shopify so we can (a) avoid
-- notifying the same checkout twice and (b) fire the `abandoned_cart`
-- automation trigger once a checkout has been abandoned past a threshold.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shopify_abandoned_checkouts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL,
  shop_domain        TEXT NOT NULL,
  checkout_id        TEXT NOT NULL,              -- Shopify checkout id (as text)
  token              TEXT,
  email              TEXT,
  phone              TEXT,
  total_price        NUMERIC DEFAULT 0,
  currency           TEXT,
  item_count         INT DEFAULT 0,
  items              JSONB DEFAULT '[]'::jsonb,  -- [{title, qty, price}]
  recovery_url       TEXT,                       -- Shopify "complete your purchase" link
  contact_id         UUID,
  -- open → just seen | notified → automation fired | recovered → they bought
  status             TEXT NOT NULL DEFAULT 'open',
  notified_at        TIMESTAMPTZ,
  recovered_at       TIMESTAMPTZ,
  shopify_created_at TIMESTAMPTZ,
  shopify_updated_at TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, checkout_id)
);

CREATE INDEX IF NOT EXISTS shopify_ac_org_status_idx
  ON public.shopify_abandoned_checkouts(organization_id, status, shopify_created_at);

-- Persist the trigger context on each enrollment so automation messages can use
-- it (e.g. the abandoned-cart recovery link via {{cart.recovery_url}}).
ALTER TABLE public.automation_enrollments
  ADD COLUMN IF NOT EXISTS trigger_data JSONB;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.shopify_abandoned_checkouts ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN others THEN NULL;
END $$;

DROP POLICY IF EXISTS "org_read_shopify_abandoned" ON public.shopify_abandoned_checkouts;
CREATE POLICY "org_read_shopify_abandoned" ON public.shopify_abandoned_checkouts FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));

-- Schedule the abandoned-cart poller every 15 minutes (gated by x-cron-secret).
DO $$
DECLARE
  v_url TEXT := 'https://oqwcgvemrvimrdrzjzil.supabase.co';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — abandoned-cart job NOT scheduled.';
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'shopify-abandoned-sync';

  PERFORM cron.schedule(
    'shopify-abandoned-sync',
    '*/15 * * * *',
    format($job$
      SELECT net.http_post(
        url     := %L,
        headers := '{"Content-Type":"application/json","x-cron-secret":"klosify-shopify-sync-2026"}'::jsonb,
        body    := '{}'::jsonb,
        timeout_milliseconds := 55000
      ) AS request_id;
    $job$, v_url || '/functions/v1/shopify-abandoned-sync')
  );
  RAISE NOTICE '✓ shopify-abandoned-sync scheduled every 15 minutes.';
END $$;
