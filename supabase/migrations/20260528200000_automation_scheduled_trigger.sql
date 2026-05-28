-- Add last_triggered_at to automations for scheduled trigger deduplication
ALTER TABLE automations ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMPTZ;

-- Index to quickly find due scheduled automations
CREATE INDEX IF NOT EXISTS idx_automations_scheduled
  ON automations (trigger_type, is_active, last_triggered_at)
  WHERE trigger_type = 'scheduled';
