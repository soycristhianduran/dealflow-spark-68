-- Google Calendar sync — store the Google Calendar event ID on each meeting
-- so we can update/delete it later when the CRM meeting changes.

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS google_event_id TEXT;

COMMENT ON COLUMN meetings.google_event_id
  IS 'ID of the corresponding Google Calendar event, when synced via OAuth.';

CREATE INDEX IF NOT EXISTS idx_meetings_google_event_id
  ON meetings(google_event_id)
  WHERE google_event_id IS NOT NULL;
