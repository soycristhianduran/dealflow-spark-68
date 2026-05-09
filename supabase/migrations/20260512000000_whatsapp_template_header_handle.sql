-- Add header_media_handle to store the approved image/video handle for media header templates.
-- This allows automation-runner to resend the same media that was approved with the template
-- without requiring a re-upload or external URL.
ALTER TABLE whatsapp_templates
  ADD COLUMN IF NOT EXISTS header_media_handle TEXT;
