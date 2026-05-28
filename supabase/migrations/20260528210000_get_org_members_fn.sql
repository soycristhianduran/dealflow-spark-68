-- Returns all org members with display names (falls back to email, then user_id).
-- SECURITY DEFINER allows reading auth.users from the client.
CREATE OR REPLACE FUNCTION get_org_members(p_org_id uuid)
RETURNS TABLE(user_id uuid, full_name text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only callable by members of this org
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id AND user_id = auth.uid()
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
