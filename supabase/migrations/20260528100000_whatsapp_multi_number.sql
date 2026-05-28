-- ============================================================================
-- Multi-number WhatsApp support
-- ============================================================================
-- Allows organizations to connect multiple WhatsApp numbers (backups, different
-- departments) instead of being limited to one number per account.
--
-- Changes:
--   1. whatsapp_configs: add `label` (user-defined name) and `is_primary`
--   2. whatsapp_messages: add `from_phone_number_id` (which of our numbers
--      sent/received this message — enables per-conversation number routing)
--   3. Backfill is_primary=true for existing single active configs
-- ============================================================================

-- ─── 1. whatsapp_configs ─────────────────────────────────────────────────────

ALTER TABLE public.whatsapp_configs
  ADD COLUMN IF NOT EXISTS label       TEXT,
  ADD COLUMN IF NOT EXISTS is_primary  BOOLEAN NOT NULL DEFAULT false;

-- Backfill: existing single active config becomes primary
UPDATE public.whatsapp_configs
SET is_primary = true
WHERE is_active = true
  AND phone_number_id <> 'pending';

-- ─── 2. whatsapp_messages ────────────────────────────────────────────────────

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS from_phone_number_id TEXT;

-- Index for efficient conversation-number routing lookups
CREATE INDEX IF NOT EXISTS idx_wa_messages_from_phone_number_id
  ON public.whatsapp_messages (from_phone_number_id)
  WHERE from_phone_number_id IS NOT NULL;
