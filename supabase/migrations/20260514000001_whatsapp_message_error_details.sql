-- Add error_details column to whatsapp_messages so failed delivery
-- status webhooks from Meta can store the failure reason.
-- Without this column, failed-status webhook updates threw a DB error
-- and the message status was never updated from "sent" to "failed".
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS error_details TEXT;
