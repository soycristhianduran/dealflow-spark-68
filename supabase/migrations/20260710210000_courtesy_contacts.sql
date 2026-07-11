-- Contactos de cortesía por organización (sin cobro). Va en una columna
-- separada de extra_contacts porque esa la sobrescribe el webhook de Stripe
-- (set_org_addon) en cada renovación del complemento comprado.
ALTER TABLE public.org_addons ADD COLUMN IF NOT EXISTS courtesy_contacts INTEGER NOT NULL DEFAULT 0;

-- El límite efectivo suma plan + complemento pagado + cortesía.
CREATE OR REPLACE FUNCTION public.org_addon_extras(p_org_id uuid)
RETURNS TABLE(extra_seats integer, extra_contacts integer)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(a.extra_seats, 0),
         COALESCE(a.extra_contacts, 0) + COALESCE(a.courtesy_contacts, 0)
  FROM (SELECT p_org_id AS oid) q
  LEFT JOIN public.org_addons a ON a.organization_id = q.oid;
$$;

-- Cortesía puntual: BAJOXQBAJO queda con tope 15.000
-- (5.000 del plan Pro + 5.000 del complemento pagado + 5.000 de cortesía).
INSERT INTO public.org_addons (organization_id, extra_seats, extra_contacts, courtesy_contacts, updated_at)
VALUES ('91258321-7e1d-40b8-a4e0-70650e001dbf', 0, 0, 5000, NOW())
ON CONFLICT (organization_id) DO UPDATE SET
  courtesy_contacts = 5000,
  updated_at = NOW();
