-- Non-billable manager ("gestor") role + platform-admin multi-org panel
-- ---------------------------------------------------------------------------
-- A "gestor" is a manager/support user with full owner-like access inside an
-- organization, but it is NOT counted as a billable seat. It is granted only by
-- platform admins (see platform_admins) — org owners cannot self-assign it, so
-- it can't be abused to dodge seat charges. Platform admins can also drop into
-- any organization for support.

-- 1. Allow the new role value.
ALTER TABLE public.organization_members
  DROP CONSTRAINT IF EXISTS organization_members_role_check;
ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_role_check
  CHECK (role = ANY (ARRAY['owner','admin','vendor','setter','readonly','member','gestor']));

-- 2. Seat-limit trigger: (a) exclude 'gestor' from the count, and (b) FIX a
--    pre-existing bug — it ignored purchased extra_seats, so a paid $9 seat
--    would still be blocked. Effective limit = max_users + org_addons.extra_seats.
CREATE OR REPLACE FUNCTION public.enforce_member_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub_row     RECORD;
  cur_count   BIGINT;
  extra_seats INTEGER;
  eff_limit   INTEGER;
BEGIN
  -- Gestores never consume a seat.
  IF NEW.role = 'gestor' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO sub_row FROM public.get_active_subscription(NEW.organization_id);
  IF sub_row IS NULL OR sub_row.max_users IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(extra_seats, 0) INTO extra_seats
  FROM public.org_addons WHERE organization_id = NEW.organization_id;
  eff_limit := sub_row.max_users + COALESCE(extra_seats, 0);

  SELECT COUNT(*) INTO cur_count
  FROM public.organization_members
  WHERE organization_id = NEW.organization_id
    AND role <> 'gestor';

  IF cur_count >= eff_limit THEN
    RAISE EXCEPTION 'member_limit_reached'
      USING
        DETAIL  = format('Tu plan permite hasta %s usuario%s. Compra asientos adicionales o mejora tu plan.',
                         eff_limit, CASE WHEN eff_limit = 1 THEN '' ELSE 's' END),
        ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Org switcher source: every organization the current user belongs to, with
--    their role. Doubles as the "organizations I administer" list for gestores.
DROP FUNCTION IF EXISTS public.get_my_administrated_organizations();
CREATE OR REPLACE FUNCTION public.get_my_administrated_organizations()
RETURNS TABLE (
  organization_id UUID,
  org_name        TEXT,
  org_slug        TEXT,
  member_role     TEXT,
  last_active_at  TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT o.id, o.name, o.slug, m.role, m.last_active_at
  FROM public.organization_members m
  JOIN public.organizations o ON o.id = m.organization_id
  WHERE m.user_id = auth.uid()
  ORDER BY m.last_active_at DESC NULLS LAST, o.created_at ASC;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_administrated_organizations() TO authenticated;

-- 4. Platform-admin panel: list ALL organizations (support / super admin).
DROP FUNCTION IF EXISTS public.platform_list_organizations();
CREATE OR REPLACE FUNCTION public.platform_list_organizations()
RETURNS TABLE (
  organization_id UUID,
  org_name        TEXT,
  org_slug        TEXT,
  member_count    BIGINT,
  created_at      TIMESTAMPTZ,
  am_member       BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT o.id, o.name, o.slug,
         (SELECT COUNT(*) FROM public.organization_members m WHERE m.organization_id = o.id AND m.role <> 'gestor'),
         o.created_at,
         EXISTS (SELECT 1 FROM public.organization_members me WHERE me.organization_id = o.id AND me.user_id = auth.uid())
  FROM public.organizations o
  WHERE public.is_platform_admin(auth.uid())
  ORDER BY o.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.platform_list_organizations() TO authenticated;

-- 5. Platform admin drops into an org for support: self-provision a gestor
--    membership (non-billable) if not already a member, return the slug to route.
DROP FUNCTION IF EXISTS public.platform_admin_enter_org(uuid);
CREATE OR REPLACE FUNCTION public.platform_admin_enter_org(p_org_id UUID)
RETURNS TABLE (org_slug TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_platform_admin' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.organization_members (user_id, organization_id, role)
  VALUES (auth.uid(), p_org_id, 'gestor')
  ON CONFLICT (user_id, organization_id) DO NOTHING;

  RETURN QUERY SELECT o.slug FROM public.organizations o WHERE o.id = p_org_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.platform_admin_enter_org(uuid) TO authenticated;

-- 6. Platform admin grants gestor to a specific existing user (by user_id) in an
--    org. (Granting by email for not-yet-registered users goes through the
--    org-invitations edge function's assign_gestor action.)
DROP FUNCTION IF EXISTS public.platform_assign_gestor(uuid, uuid);
CREATE OR REPLACE FUNCTION public.platform_assign_gestor(p_user_id UUID, p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_platform_admin' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.organization_members (user_id, organization_id, role)
  VALUES (p_user_id, p_org_id, 'gestor')
  ON CONFLICT (user_id, organization_id) DO UPDATE SET role = 'gestor';
END;
$$;
GRANT EXECUTE ON FUNCTION public.platform_assign_gestor(uuid, uuid) TO authenticated;
