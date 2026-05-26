ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lost_reason TEXT;
COMMENT ON COLUMN contacts.lost_reason IS 'Reason why the deal was lost (set when lead_status = lost)';
