-- ─────────────────────────────────────────────────────────────────────────────
-- addon_catalog — sellable capacity add-ons (recurring), readable by the app.
-- Populated by the admin-setup-addons edge function (creates the Stripe prices).
-- The BillingPage reads this to render buy buttons; checkout passes addon_kind.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.addon_catalog (
  key               TEXT        PRIMARY KEY,            -- 'extra_seats' | 'extra_contacts'
  name              TEXT        NOT NULL,
  kind              TEXT        NOT NULL,               -- maps to set_org_addon p_kind
  unit_label        TEXT        NOT NULL,               -- e.g. 'usuario', 'paquete de 5.000 contactos'
  units_per_pack    INTEGER     NOT NULL DEFAULT 1,     -- capacity granted per Stripe unit
  monthly_price_usd NUMERIC     NOT NULL,
  stripe_price_id   TEXT,                               -- filled by setup function
  display_order     INTEGER     NOT NULL DEFAULT 0,
  active            BOOLEAN     NOT NULL DEFAULT true,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.addon_catalog ENABLE ROW LEVEL SECURITY;

-- Catalog is public to any authenticated user (pricing info, not sensitive).
CREATE POLICY "authenticated_read_addon_catalog"
  ON public.addon_catalog FOR SELECT
  TO authenticated
  USING (true);

-- Seed the two add-ons (price IDs filled in by admin-setup-addons).
INSERT INTO public.addon_catalog (key, name, kind, unit_label, units_per_pack, monthly_price_usd, display_order)
VALUES
  ('extra_seats',    'Asientos adicionales', 'extra_seats',    'usuario',                       1,    12, 1),
  ('extra_contacts', 'Contactos adicionales','extra_contacts', 'paquete de 5.000 contactos',    5000,  9, 2)
ON CONFLICT (key) DO NOTHING;
