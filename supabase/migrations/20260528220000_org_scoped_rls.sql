-- Allow org members to see all members in their org
CREATE POLICY "org_members_view_same_org"
ON public.organization_members FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT om2.organization_id FROM organization_members om2
    WHERE om2.user_id = auth.uid()
  )
);

-- Allow users to read profiles of people in their org
CREATE POLICY "profiles_view_same_org"
ON public.profiles FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT om.user_id FROM organization_members om
    WHERE om.organization_id IN (
      SELECT om2.organization_id FROM organization_members om2
      WHERE om2.user_id = auth.uid()
    )
  )
);

-- Fix get_org_members: read JWT claims directly (reliable inside SECURITY DEFINER)
CREATE OR REPLACE FUNCTION get_org_members(p_org_id uuid)
RETURNS TABLE(user_id uuid, full_name text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
BEGIN
  v_caller_id := NULLIF(current_setting('request.jwt.claims', true), '')::json->>'sub';
  IF v_caller_id IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM organization_members om_check
    WHERE om_check.organization_id = p_org_id
      AND om_check.user_id = v_caller_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    om.user_id,
    COALESCE(
      NULLIF(TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), ''),
      u.email,
      om.user_id::text
    ) AS full_name,
    u.email
  FROM organization_members om
  LEFT JOIN profiles p ON p.user_id = om.user_id
  JOIN auth.users u ON u.id = om.user_id
  WHERE om.organization_id = p_org_id;
END;
$$;
