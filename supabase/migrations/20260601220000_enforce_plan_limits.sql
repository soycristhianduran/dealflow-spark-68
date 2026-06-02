-- Enforce plan limits on contacts and organization members
--
-- 1. trg_enforce_contact_limit  — blocks INSERT on contacts when org is at plan cap
-- 2. trg_enforce_member_limit   — blocks INSERT on organization_members when org is at seat cap

-- ===== 1. Contact limit ======================================================
CREATE OR REPLACE FUNCTION enforce_contact_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub_row  RECORD;
  cur_count BIGINT;
BEGIN
  -- Fetch active subscription for this org
  SELECT * INTO sub_row FROM public.get_active_subscription(NEW.organization_id);

  -- No subscription row or unlimited plan → allow
  IF sub_row IS NULL OR sub_row.max_contacts IS NULL THEN
    RETURN NEW;
  END IF;

  -- Count existing contacts (before this insert)
  SELECT COUNT(*) INTO cur_count
  FROM contacts
  WHERE organization_id = NEW.organization_id;

  IF cur_count >= sub_row.max_contacts THEN
    RAISE EXCEPTION 'contact_limit_reached'
      USING
        DETAIL  = format('Tu plan permite hasta %s contactos. Mejora tu plan para agregar más.', sub_row.max_contacts),
        ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION enforce_contact_limit()
  IS 'Blocks contact INSERT when the org has reached its plan contact limit.';

DROP TRIGGER IF EXISTS trg_enforce_contact_limit ON contacts;
CREATE TRIGGER trg_enforce_contact_limit
  BEFORE INSERT ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION enforce_contact_limit();

-- ===== 2. Member (seat) limit ================================================
CREATE OR REPLACE FUNCTION enforce_member_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub_row   RECORD;
  cur_count BIGINT;
BEGIN
  SELECT * INTO sub_row FROM public.get_active_subscription(NEW.organization_id);

  IF sub_row IS NULL OR sub_row.max_users IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO cur_count
  FROM organization_members
  WHERE organization_id = NEW.organization_id;

  IF cur_count >= sub_row.max_users THEN
    RAISE EXCEPTION 'member_limit_reached'
      USING
        DETAIL  = format('Tu plan permite hasta %s usuario%s. Mejora tu plan para agregar más.',
                         sub_row.max_users,
                         CASE WHEN sub_row.max_users = 1 THEN '' ELSE 's' END),
        ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION enforce_member_limit()
  IS 'Blocks organization_members INSERT when the org has reached its plan seat limit.';

DROP TRIGGER IF EXISTS trg_enforce_member_limit ON organization_members;
CREATE TRIGGER trg_enforce_member_limit
  BEFORE INSERT ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION enforce_member_limit();
