-- Add wa_media_id to whatsapp_messages so we can retry media fetch if webhook download fails
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS wa_media_id TEXT;
