-- ============================================================
-- Outbound webhooks: let users connect n8n / Zapier / Make
-- ============================================================

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url              text        NOT NULL,
  events           text[]      NOT NULL DEFAULT '{}',
  -- secret for HMAC-SHA256 signature on each delivery
  secret           text        NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_triggered_at timestamptz,
  failure_count    int         NOT NULL DEFAULT 0
);

ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_manage_webhooks"
ON webhook_subscriptions FOR ALL TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  )
);

-- ── pg_net trigger: fire webhook-dispatcher on contact INSERT ────────────────
CREATE OR REPLACE FUNCTION notify_webhook_contact_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://oqwcgvemrvimrdrzjzil.supabase.co/functions/v1/webhook-dispatcher',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := jsonb_build_object(
      'event',           'contact.created',
      'organization_id', NEW.organization_id::text,
      'data',            row_to_json(NEW)
    )
  );
  RETURN NEW;
END;
$$;

-- ── pg_net trigger: fire webhook-dispatcher on meaningful contact UPDATE ─────
CREATE OR REPLACE FUNCTION notify_webhook_contact_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Only fire on changes that matter to integrations
  IF (
    NEW.lead_status    IS DISTINCT FROM OLD.lead_status   OR
    NEW.owner_id       IS DISTINCT FROM OLD.owner_id      OR
    NEW.primary_email  IS DISTINCT FROM OLD.primary_email OR
    NEW.primary_phone  IS DISTINCT FROM OLD.primary_phone OR
    NEW.first_name     IS DISTINCT FROM OLD.first_name    OR
    NEW.last_name      IS DISTINCT FROM OLD.last_name     OR
    NEW.tags           IS DISTINCT FROM OLD.tags          OR
    NEW.score          IS DISTINCT FROM OLD.score
  ) THEN
    PERFORM net.http_post(
      url     := 'https://oqwcgvemrvimrdrzjzil.supabase.co/functions/v1/webhook-dispatcher',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := jsonb_build_object(
        'event',           'contact.updated',
        'organization_id', NEW.organization_id::text,
        'data',            row_to_json(NEW)
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_webhook_contact_insert ON contacts;
CREATE TRIGGER trg_webhook_contact_insert
  AFTER INSERT ON contacts
  FOR EACH ROW EXECUTE FUNCTION notify_webhook_contact_insert();

DROP TRIGGER IF EXISTS trg_webhook_contact_update ON contacts;
CREATE TRIGGER trg_webhook_contact_update
  AFTER UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION notify_webhook_contact_update();
