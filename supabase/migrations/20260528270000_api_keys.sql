-- ============================================================
-- API Keys: let org members generate keys to send data into the CRM
-- from external sources (WordPress, Zapier, n8n, Make, etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL,                        -- e.g. "WordPress sitio principal"
  key_hash        text        NOT NULL UNIQUE,                 -- SHA-256 of the actual key (never stored plain)
  key_prefix      text        NOT NULL,                        -- first 12 chars for display "sk_live_xxxx"
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz,
  is_active       boolean     NOT NULL DEFAULT true
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_manage_api_keys"
ON api_keys FOR ALL TO authenticated
USING  (organization_id IN (SELECT get_my_organization_ids()))
WITH CHECK (organization_id IN (SELECT get_my_organization_ids()));

-- Index for fast key lookup on every API request
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash) WHERE is_active = true;
