-- Add utm_term column to contacts (utm_source/medium/campaign/content already exist)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS utm_term TEXT;

COMMENT ON COLUMN contacts.utm_term IS 'UTM term parameter (search keyword for paid search ads)';
