-- ─────────────────────────────────────────────────────────────────────────────
-- Capacity add-ons: extra seats (users) and extra contacts
--
-- These are pure-margin upsells (they cost Klosify nothing) that let a customer
-- grow capacity without jumping a whole plan tier. They are sold as recurring
-- Stripe subscriptions (separate from the plan subscription) and reconciled by
-- the stripe-webhook into org_addons. Limit-enforcement triggers add the
-- purchased extras on top of the plan cap.
--
--   extra_seats     : +N users      (1 unit  = 1 user)
--   extra_contacts  : +N contacts   (1 unit  = 1000 contacts, set per-price)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Per-org purchased capacity. One row per org; webhook keeps it in sync.
CREATE TABLE IF NOT EXISTS public.org_addons (
  organization_id  UUID        PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  extra_seats      INTEGER     NOT NULL DEFAULT 0,
  extra_contacts   INTEGER     NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.org_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read_org_addons"
  ON public.org_addons FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- 2. Helper: current extras for an org (0/0 when no row).
CREATE OR REPLACE FUNCTION public.org_addon_extras(p_org_id UUID)
RETURNS TABLE (extra_seats INTEGER, extra_contacts INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(a.extra_seats, 0), COALESCE(a.extra_contacts, 0)
  FROM (SELECT p_org_id AS oid) q
  LEFT JOIN public.org_addons a ON a.organization_id = q.oid;
$$;

-- 3. Webhook reconcile entry point — sets one add-on dimension from a Stripe
--    subscription item quantity. kind = 'extra_seats' | 'extra_contacts'.
CREATE OR REPLACE FUNCTION public.set_org_addon(
  p_org_id   UUID,
  p_kind     TEXT,
  p_quantity INTEGER
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.org_addons (organization_id, extra_seats, extra_contacts, updated_at)
  VALUES (
    p_org_id,
    CASE WHEN p_kind = 'extra_seats'    THEN GREATEST(p_quantity, 0) ELSE 0 END,
    CASE WHEN p_kind = 'extra_contacts' THEN GREATEST(p_quantity, 0) ELSE 0 END,
    NOW()
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    extra_seats    = CASE WHEN p_kind = 'extra_seats'    THEN GREATEST(p_quantity, 0) ELSE public.org_addons.extra_seats    END,
    extra_contacts = CASE WHEN p_kind = 'extra_contacts' THEN GREATEST(p_quantity, 0) ELSE public.org_addons.extra_contacts END,
    updated_at     = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.org_addon_extras(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_org_addon(uuid, text, integer) TO service_role;

-- 4. Fold extras into the limit-enforcement triggers.
CREATE OR REPLACE FUNCTION enforce_contact_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  sub_row   RECORD;
  cur_count BIGINT;
  v_extra   INTEGER := 0;
  v_cap     BIGINT;
BEGIN
  SELECT * INTO sub_row FROM public.get_active_subscription(NEW.organization_id);
  IF sub_row IS NULL OR sub_row.max_contacts IS NULL THEN
    RETURN NEW;  -- no sub or unlimited plan
  END IF;

  SELECT extra_contacts INTO v_extra FROM public.org_addon_extras(NEW.organization_id);
  v_cap := sub_row.max_contacts + COALESCE(v_extra, 0);

  SELECT COUNT(*) INTO cur_count FROM contacts WHERE organization_id = NEW.organization_id;

  IF cur_count >= v_cap THEN
    RAISE EXCEPTION 'contact_limit_reached'
      USING
        DETAIL  = format('Tu plan permite hasta %s contactos. Compra el complemento de contactos o mejora tu plan para agregar más.', v_cap),
        ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_member_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  sub_row   RECORD;
  cur_count BIGINT;
  v_extra   INTEGER := 0;
  v_cap     BIGINT;
BEGIN
  SELECT * INTO sub_row FROM public.get_active_subscription(NEW.organization_id);
  IF sub_row IS NULL OR sub_row.max_users IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT extra_seats INTO v_extra FROM public.org_addon_extras(NEW.organization_id);
  v_cap := sub_row.max_users + COALESCE(v_extra, 0);

  SELECT COUNT(*) INTO cur_count FROM organization_members WHERE organization_id = NEW.organization_id;

  IF cur_count >= v_cap THEN
    RAISE EXCEPTION 'member_limit_reached'
      USING
        DETAIL  = format('Tu plan permite hasta %s usuario%s. Compra asientos adicionales o mejora tu plan.',
                         v_cap, CASE WHEN v_cap = 1 THEN '' ELSE 's' END),
        ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;
