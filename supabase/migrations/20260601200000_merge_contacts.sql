-- merge_contacts: fuses a secondary contact into a primary one.
-- Reassigns all related data, merges fields, logs an activity, deletes secondary.

CREATE OR REPLACE FUNCTION merge_contacts(
  p_primary_id   UUID,
  p_secondary_id UUID,
  p_org_id       UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_primary   contacts%ROWTYPE;
  v_secondary contacts%ROWTYPE;
BEGIN

  -- 1. Validate inputs
  IF p_primary_id = p_secondary_id THEN
    RAISE EXCEPTION 'merge_contacts: primary and secondary IDs must be different';
  END IF;

  SELECT * INTO v_primary
  FROM contacts
  WHERE id = p_primary_id AND organization_id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_contacts: primary contact % not found in org %', p_primary_id, p_org_id;
  END IF;

  SELECT * INTO v_secondary
  FROM contacts
  WHERE id = p_secondary_id AND organization_id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_contacts: secondary contact % not found in org %', p_secondary_id, p_org_id;
  END IF;

  -- 2. Reassign related records: secondary → primary

  UPDATE whatsapp_messages   SET contact_id = p_primary_id WHERE contact_id = p_secondary_id;
  UPDATE call_logs            SET contact_id = p_primary_id WHERE contact_id = p_secondary_id;
  UPDATE tasks                SET contact_id = p_primary_id WHERE contact_id = p_secondary_id;
  UPDATE meetings             SET contact_id = p_primary_id WHERE contact_id = p_secondary_id;
  UPDATE deals                SET contact_id = p_primary_id WHERE contact_id = p_secondary_id;
  UPDATE instagram_conversations SET contact_id = p_primary_id WHERE contact_id = p_secondary_id;

  UPDATE activities
  SET related_entity_id = p_primary_id
  WHERE related_entity_id = p_secondary_id
    AND related_entity_type = 'contact';

  -- contact_ai_analyses: if primary already has one, drop secondary's to avoid unique violation
  DELETE FROM contact_ai_analyses
  WHERE contact_id = p_secondary_id
    AND EXISTS (SELECT 1 FROM contact_ai_analyses WHERE contact_id = p_primary_id);

  UPDATE contact_ai_analyses
  SET contact_id = p_primary_id
  WHERE contact_id = p_secondary_id;

  -- 3. Merge fields on the primary contact row
  UPDATE contacts
  SET
    tags          = ARRAY(SELECT DISTINCT unnest(
                      COALESCE(v_primary.tags, '{}') || COALESCE(v_secondary.tags, '{}')
                    )),
    custom_fields = COALESCE(v_secondary.custom_fields, '{}'::jsonb)
                    || COALESCE(v_primary.custom_fields, '{}'::jsonb),
    first_name    = COALESCE(v_primary.first_name,    v_secondary.first_name),
    last_name     = COALESCE(v_primary.last_name,     v_secondary.last_name),
    full_name     = COALESCE(NULLIF(TRIM(COALESCE(v_primary.full_name,'')), ''), v_secondary.full_name),
    primary_email = COALESCE(v_primary.primary_email, v_secondary.primary_email),
    primary_phone = COALESCE(v_primary.primary_phone, v_secondary.primary_phone),
    company_name  = COALESCE(v_primary.company_name,  v_secondary.company_name),
    city          = COALESCE(v_primary.city,          v_secondary.city),
    country       = COALESCE(v_primary.country,       v_secondary.country),
    score         = GREATEST(COALESCE(v_primary.score, 0), COALESCE(v_secondary.score, 0))
  WHERE id = p_primary_id;

  -- 4. Log a merge activity on the primary contact's timeline
  INSERT INTO activities (
    organization_id,
    related_entity_id,
    related_entity_type,
    event_type,
    event_source,
    summary
  ) VALUES (
    p_org_id,
    p_primary_id,
    'contact',
    'system',
    'merge',
    '🔀 Contacto fusionado — origen secundario: ' ||
      COALESCE(v_secondary.source::text, 'desconocido') ||
      ', tel: ' || COALESCE(v_secondary.primary_phone, '-')
  );

  -- 5. Delete the secondary contact
  DELETE FROM contacts WHERE id = p_secondary_id;

  -- 6. Recalculate score
  PERFORM recalculate_contact_score(p_primary_id);

  RETURN jsonb_build_object('success', true, 'primary_id', p_primary_id);
END;
$$;

COMMENT ON FUNCTION merge_contacts(UUID, UUID, UUID)
  IS 'Merges secondary contact into primary: reassigns all related data, merges fields, logs activity, deletes secondary.';
