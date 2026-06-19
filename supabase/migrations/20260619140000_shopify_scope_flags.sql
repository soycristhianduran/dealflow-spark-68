-- Store which Shopify scopes the connected token actually has, so the UI can
-- tell the merchant up-front whether abandoned-cart recovery + product images
-- will work (no more silent failures).
ALTER TABLE public.shopify_configs
  ADD COLUMN IF NOT EXISTS scope_checkouts   BOOLEAN,
  ADD COLUMN IF NOT EXISTS scope_products    BOOLEAN,
  ADD COLUMN IF NOT EXISTS scopes_checked_at TIMESTAMPTZ;
