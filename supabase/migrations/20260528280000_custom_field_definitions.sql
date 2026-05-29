-- ============================================================
-- Custom field definitions at org level
-- ============================================================
-- Defines which custom fields exist for an organization.
-- Values are stored per-contact in contacts.custom_fields JSONB.
-- ============================================================

CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key             text        NOT NULL,  -- JSON key used in contacts.custom_fields
  label           text        NOT NULL,  -- human-readable label shown in UI
  field_type      text        NOT NULL DEFAULT 'text'
                              CHECK (field_type IN ('text','number','date','select','boolean')),
  options         text[]      DEFAULT NULL,  -- only for field_type = 'select'
  position        integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);

ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_manage_custom_fields"
ON custom_field_definitions FOR ALL TO authenticated
USING  (organization_id IN (SELECT get_my_organization_ids()))
WITH CHECK (organization_id IN (SELECT get_my_organization_ids()));

CREATE INDEX IF NOT EXISTS idx_custom_field_defs_org
  ON custom_field_definitions (organization_id, position);
