-- CRITICAL FIX: enforce_member_limit declared a variable named extra_seats
-- which is ambiguous with org_addons.extra_seats inside its SELECT. Every
-- INSERT into organization_members failed (42702), which silently broke
-- organization provisioning for ALL new signups since 2026-06-29.
CREATE OR REPLACE FUNCTION public.enforce_member_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sub_row      RECORD;
  cur_count    BIGINT;
  v_extra      INTEGER;
  eff_limit    INTEGER;
BEGIN
  -- Gestores never consume a seat.
  IF NEW.role = 'gestor' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO sub_row FROM public.get_active_subscription(NEW.organization_id);
  IF sub_row IS NULL OR sub_row.max_users IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(a.extra_seats, 0) INTO v_extra
  FROM public.org_addons a WHERE a.organization_id = NEW.organization_id;
  eff_limit := sub_row.max_users + COALESCE(v_extra, 0);

  SELECT COUNT(*) INTO cur_count
  FROM public.organization_members m
  WHERE m.organization_id = NEW.organization_id
    AND m.role <> 'gestor';

  IF cur_count >= eff_limit THEN
    RAISE EXCEPTION 'member_limit_reached'
      USING
        DETAIL  = format('Tu plan permite hasta %s usuario%s. Compra asientos adicionales o mejora tu plan.',
                         eff_limit, CASE WHEN eff_limit = 1 THEN '' ELSE 's' END),
        ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;
