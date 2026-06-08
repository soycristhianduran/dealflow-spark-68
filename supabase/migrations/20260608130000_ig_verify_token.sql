-- Add a unique verify_token to pending deliveries so we can build
-- a one-click "Ya te sigo" verification page without exposing internal IDs.
ALTER TABLE public.instagram_pending_deliveries
  ADD COLUMN IF NOT EXISTS verify_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_ig_pending_verify_token
  ON public.instagram_pending_deliveries (verify_token);
