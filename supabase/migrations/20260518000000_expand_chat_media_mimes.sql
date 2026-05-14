-- The 'whatsapp-media' bucket was created with a narrow MIME allowlist
-- (images + video + pdf only) before Instagram audio/file sending was
-- implemented.  Expand it to cover every MIME type both channels need.
--
-- WhatsApp uses Meta's media_id flow so storage upload is best-effort
-- (audio bypasses storage and goes straight to Meta).  Instagram REQUIRES
-- a public URL in the attachment payload, so storage upload MUST succeed.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  -- Images
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  -- Video
  'video/mp4', 'video/3gpp', 'video/quicktime',
  -- Audio (Instagram + WhatsApp voice notes use ogg/opus)
  'audio/ogg', 'audio/opus', 'audio/mpeg', 'audio/mp3',
  'audio/mp4', 'audio/aac', 'audio/m4a', 'audio/wav',
  -- Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv'
]
WHERE id = 'whatsapp-media';
