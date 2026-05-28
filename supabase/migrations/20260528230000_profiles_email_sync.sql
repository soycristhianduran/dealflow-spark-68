-- Add email column to profiles (synced from auth.users)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- Populate existing profiles
UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id AND p.email IS NULL;

-- Create profiles for org members who don't have one
INSERT INTO profiles (user_id, email)
SELECT u.id, u.email
FROM auth.users u
JOIN organization_members om ON om.user_id = u.id
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

-- Auto-sync email when a profile is created
CREATE OR REPLACE FUNCTION sync_profile_email()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.email IS NULL THEN
    SELECT email INTO NEW.email FROM auth.users WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_email ON profiles;
CREATE TRIGGER trg_sync_profile_email
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION sync_profile_email();
