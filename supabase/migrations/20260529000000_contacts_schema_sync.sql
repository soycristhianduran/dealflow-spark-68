-- ============================================================
-- contacts schema sync
-- ============================================================
-- Several columns exist in production but were never captured
-- in a migration file (likely added via Supabase dashboard SQL).
-- This migration:
--   1. Documents those columns with ADD COLUMN IF NOT EXISTS
--      (no-op if already present, idempotent).
--   2. Adds company_name TEXT — the only truly new column.
--   3. Adds a BEFORE UPDATE trigger to keep the legacy `status`
--      field in sync with `lead_status` so the scoring function
--      (which reads `status`) keeps working correctly.
-- ============================================================

-- ── 1. Document existing columns (no-ops) ─────────────────────────────────
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_status         TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS budget              NUMERIC;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS budget_currency     TEXT    NOT NULL DEFAULT 'USD';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS expected_close_date DATE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS pipeline_id         UUID    REFERENCES pipelines(id)        ON DELETE SET NULL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS stage_id            UUID    REFERENCES pipeline_stages(id)   ON DELETE SET NULL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS meta_ad_id          TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS meta_adset_id       TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS meta_campaign_id    TEXT;

-- ── 2. New column: company_name ───────────────────────────────────────────
-- Text name stored directly on the contact (denormalized).
-- Separate from company_id FK (used for the companies table relationship).
-- This is what WordPress/Zapier/n8n send via the public API.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company_name TEXT;

-- ── 3. Comments for clarity ────────────────────────────────────────────────
COMMENT ON COLUMN contacts.status        IS 'Legacy status (new/client/lost). Keep in sync via trg_sync_status_from_lead_status. Use lead_status for all application code.';
COMMENT ON COLUMN contacts.lead_status   IS 'Primary lead status used by the application: active | won | lost | disqualified';
COMMENT ON COLUMN contacts.company_name  IS 'Company name as plain text (denormalized). For FK relationship see company_id.';
COMMENT ON COLUMN contacts.budget        IS 'Estimated deal budget (stored on contact for convenience alongside the deal).';
COMMENT ON COLUMN contacts.pipeline_id   IS 'Current pipeline the contact is assigned to.';
COMMENT ON COLUMN contacts.stage_id      IS 'Current pipeline stage the contact is in.';
COMMENT ON COLUMN contacts.meta_ad_id    IS 'Meta Ads: ad ID that originated this contact.';
COMMENT ON COLUMN contacts.meta_adset_id IS 'Meta Ads: ad set ID that originated this contact.';
COMMENT ON COLUMN contacts.meta_campaign_id IS 'Meta Ads: campaign ID that originated this contact.';

-- ── 4. Trigger: keep legacy `status` in sync with `lead_status` ───────────
-- The contact scoring function (calculate_contact_score) reads `status`
-- to give clients 100 pts and lost leads 10 pts.  All UI code uses
-- `lead_status`.  This trigger bridges the gap automatically.

CREATE OR REPLACE FUNCTION sync_status_from_lead_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only act when lead_status actually changes
  IF NEW.lead_status IS DISTINCT FROM OLD.lead_status THEN
    NEW.status := CASE NEW.lead_status
      WHEN 'won'           THEN 'client'
      WHEN 'lost'          THEN 'lost'
      WHEN 'disqualified'  THEN 'lost'
      ELSE COALESCE(OLD.status, 'new')  -- preserve existing or default
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_status_from_lead_status ON contacts;
CREATE TRIGGER trg_sync_status_from_lead_status
  BEFORE UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION sync_status_from_lead_status();

-- ── 5. Back-fill: sync existing rows where status=client/lost ─────────────
-- Ensure existing "won" contacts that have status='client' get lead_status='won'
UPDATE contacts
SET lead_status = CASE status
    WHEN 'client' THEN 'won'
    WHEN 'lost'   THEN 'lost'
    ELSE COALESCE(lead_status, 'active')
  END
WHERE status IN ('client', 'lost')
  AND (lead_status IS NULL OR lead_status NOT IN ('won', 'lost'));

-- Ensure all other contacts that have no lead_status get a default
UPDATE contacts
SET lead_status = 'active'
WHERE lead_status IS NULL;
