-- Add 'ready_to_deliver' status: follower verified via page, waiting for user to send any DM
-- (Instagram only allows DMs within 24h window after user messages us)
ALTER TABLE public.instagram_pending_deliveries
  DROP CONSTRAINT IF EXISTS instagram_pending_deliveries_status_check;

ALTER TABLE public.instagram_pending_deliveries
  ADD CONSTRAINT instagram_pending_deliveries_status_check
  CHECK (status IN ('waiting_follow', 'ready_to_deliver', 'delivered', 'expired'));

-- Update the index to include ready_to_deliver
DROP INDEX IF EXISTS idx_ig_pending_commenter;
CREATE INDEX IF NOT EXISTS idx_ig_pending_commenter
  ON public.instagram_pending_deliveries (ig_account_id, commenter_id)
  WHERE status IN ('waiting_follow', 'ready_to_deliver');
