-- ============================================================
-- SaaS hardening: ensure every new user always gets a profile
-- ============================================================
-- Root cause: handle_new_user_organization created the org and
-- organization_members row on signup but never created a profiles row.
-- Result: vendor list, assign-owner, and any feature that reads
-- profiles would silently return nothing for that user.
--
-- Fix 1: update the signup trigger to also insert a profiles row.
-- Fix 2: add a safety-net trigger on organization_members so that
--   any user added to an org (invite flow, admin add, etc.) always
--   gets a profiles row — even if fix 1 somehow missed them.
-- ============================================================

-- Fix 1: signup trigger — create org + member + profile atomically
CREATE OR REPLACE FUNCTION handle_new_user_organization()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id   uuid;
  org_name text;
BEGIN
  org_name := COALESCE(NEW.raw_user_meta_data->>'company_name', split_part(NEW.email, '@', 1));

  INSERT INTO organizations (name) VALUES (org_name) RETURNING id INTO org_id;

  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (org_id, NEW.id, 'owner');

  -- Always create a profile row so vendor lists and other features work
  INSERT INTO profiles (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;

  RETURN NEW;
END;
$$;

-- Fix 2: safety-net trigger — any new org_member row → ensure profile exists
CREATE OR REPLACE FUNCTION ensure_member_has_profile()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (user_id, email)
  SELECT NEW.user_id, u.email
  FROM auth.users u
  WHERE u.id = NEW.user_id
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_member_profile ON organization_members;
CREATE TRIGGER trg_ensure_member_profile
  AFTER INSERT ON organization_members
  FOR EACH ROW EXECUTE FUNCTION ensure_member_has_profile();
