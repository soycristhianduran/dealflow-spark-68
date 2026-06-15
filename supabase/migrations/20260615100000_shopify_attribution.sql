-- ─────────────────────────────────────────────────────────────────────────────
-- Shopify integration + campaign sales attribution (email + WhatsApp).
-- Per-org store connection (OAuth public app). Paid orders arrive via webhook and
-- are attributed to the campaign that most likely drove them (HYBRID model):
--   1) discount code match (highest confidence)
--   2) customer email match within window  → email campaign
--   3) customer phone match within window  → whatsapp campaign
-- Last-touch within an attribution window (default 7 days).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Per-org Shopify connection (like whatsapp_configs).
CREATE TABLE IF NOT EXISTS public.shopify_configs (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  shop_domain        TEXT        NOT NULL,                 -- e.g. mitienda.myshopify.com
  access_token       TEXT,
  scope              TEXT,
  attribution_window_days INTEGER NOT NULL DEFAULT 7,
  is_active          BOOLEAN     NOT NULL DEFAULT true,
  webhook_registered BOOLEAN     NOT NULL DEFAULT false,
  connected_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, shop_domain)
);
CREATE INDEX IF NOT EXISTS shopify_configs_org_idx ON public.shopify_configs(organization_id);

-- 2. Orders pulled from Shopify (orders/paid webhook).
CREATE TABLE IF NOT EXISTS public.shopify_orders (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  shop_domain        TEXT        NOT NULL,
  shopify_order_id   BIGINT      NOT NULL,
  order_number       TEXT,
  email              TEXT,
  phone              TEXT,
  total_price        NUMERIC     NOT NULL DEFAULT 0,
  currency           TEXT,
  financial_status   TEXT,
  discount_codes     JSONB       NOT NULL DEFAULT '[]',    -- ["WELCOME10", ...]
  landing_site       TEXT,
  referring_site     TEXT,
  shopify_created_at TIMESTAMPTZ,                          -- order date (for the window)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, shopify_order_id)
);
CREATE INDEX IF NOT EXISTS shopify_orders_match_idx ON public.shopify_orders(organization_id, email, phone, shopify_created_at);

-- 3. Optional per-campaign discount code (precise attribution).
CREATE TABLE IF NOT EXISTS public.campaign_discount_codes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_type   TEXT        NOT NULL,                    -- 'email' | 'whatsapp'
  campaign_id     UUID        NOT NULL,
  code            TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

-- 4. Resolved attributions (one last-touch attribution per order).
CREATE TABLE IF NOT EXISTS public.campaign_attributions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  order_id        UUID        NOT NULL REFERENCES public.shopify_orders(id) ON DELETE CASCADE,
  campaign_type   TEXT        NOT NULL,                    -- 'email' | 'whatsapp'
  campaign_id     UUID        NOT NULL,
  method          TEXT        NOT NULL,                    -- discount_code | customer_email | customer_phone
  amount          NUMERIC     NOT NULL DEFAULT 0,
  currency        TEXT,
  attributed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id)
);
CREATE INDEX IF NOT EXISTS campaign_attr_campaign_idx ON public.campaign_attributions(organization_id, campaign_type, campaign_id);

-- ── RLS: org members can read; writes via service role (webhook) ──
DO $$ BEGIN
  EXECUTE 'ALTER TABLE public.shopify_configs ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.shopify_orders ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.campaign_discount_codes ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.campaign_attributions ENABLE ROW LEVEL SECURITY';
END $$;

CREATE POLICY "org_read_shopify_configs" ON public.shopify_configs FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_read_shopify_orders" ON public.shopify_orders FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_rw_discount_codes" ON public.campaign_discount_codes FOR ALL
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_read_attributions" ON public.campaign_attributions FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));

-- ── Hybrid last-touch attribution engine ──
CREATE OR REPLACE FUNCTION public.attribute_shopify_order(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  o          RECORD;
  v_window   INTEGER;
  v_type     TEXT;
  v_camp     UUID;
  v_method   TEXT;
BEGIN
  SELECT * INTO o FROM shopify_orders WHERE id = p_order_id;
  IF o IS NULL THEN RETURN; END IF;

  SELECT COALESCE(MAX(attribution_window_days), 7) INTO v_window
  FROM shopify_configs WHERE organization_id = o.organization_id;

  DELETE FROM campaign_attributions WHERE order_id = p_order_id;  -- idempotent

  -- 1) Discount code (highest confidence)
  SELECT c.campaign_type, c.campaign_id INTO v_type, v_camp
  FROM campaign_discount_codes c
  WHERE c.organization_id = o.organization_id
    AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(o.discount_codes) dc WHERE lower(dc) = lower(c.code))
  LIMIT 1;
  IF v_camp IS NOT NULL THEN v_method := 'discount_code'; END IF;

  -- 2) Email match → email campaign (last-touch in window)
  IF v_camp IS NULL AND o.email IS NOT NULL THEN
    SELECT 'email', es.campaign_id INTO v_type, v_camp
    FROM email_sends es
    WHERE es.organization_id = o.organization_id AND es.campaign_id IS NOT NULL
      AND lower(es.email_address) = lower(o.email)
      AND es.sent_at <= o.shopify_created_at
      AND es.sent_at >= o.shopify_created_at - (v_window || ' days')::interval
    ORDER BY es.sent_at DESC LIMIT 1;
    IF v_camp IS NOT NULL THEN v_method := 'customer_email'; END IF;
  END IF;

  -- 3) Phone match → whatsapp campaign (last 10 digits)
  IF v_camp IS NULL AND o.phone IS NOT NULL THEN
    SELECT 'whatsapp', ws.campaign_id INTO v_type, v_camp
    FROM whatsapp_sends ws
    WHERE ws.organization_id = o.organization_id AND ws.campaign_id IS NOT NULL
      AND right(regexp_replace(ws.phone, '[^0-9]', '', 'g'), 10) = right(regexp_replace(o.phone, '[^0-9]', '', 'g'), 10)
      AND ws.sent_at <= o.shopify_created_at
      AND ws.sent_at >= o.shopify_created_at - (v_window || ' days')::interval
    ORDER BY ws.sent_at DESC LIMIT 1;
    IF v_camp IS NOT NULL THEN v_method := 'customer_phone'; END IF;
  END IF;

  IF v_camp IS NOT NULL THEN
    INSERT INTO campaign_attributions (organization_id, order_id, campaign_type, campaign_id, method, amount, currency)
    VALUES (o.organization_id, p_order_id, v_type, v_camp, v_method, o.total_price, o.currency);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.attribute_shopify_order(uuid) TO service_role;

-- ── Per-campaign ROI rollup (read by the campaigns UI) ──
CREATE OR REPLACE VIEW public.campaign_sales_roi AS
SELECT organization_id, campaign_type, campaign_id,
       COUNT(*)                AS attributed_orders,
       SUM(amount)             AS attributed_revenue,
       MAX(currency)           AS currency
FROM public.campaign_attributions
GROUP BY organization_id, campaign_type, campaign_id;
