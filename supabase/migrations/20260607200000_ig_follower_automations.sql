-- ============================================================
-- Instagram follower-gate automation
-- Allows automations to gate lead magnet delivery behind
-- a follower check — matching ManyChat "comment DM" flows.
-- ============================================================

-- Add non-follower message + follow keyword to automations
ALTER TABLE public.instagram_comment_automations
  ADD COLUMN IF NOT EXISTS dm_message_non_follower TEXT,
  ADD COLUMN IF NOT EXISTS follow_keyword          TEXT DEFAULT 'LISTO';

COMMENT ON COLUMN public.instagram_comment_automations.dm_message_non_follower IS
  'DM sent to people who commented but do NOT follow the account. Should instruct them to follow and then reply a keyword.';

COMMENT ON COLUMN public.instagram_comment_automations.follow_keyword IS
  'Keyword the non-follower must DM back after following to trigger resource delivery. Case-insensitive.';

-- Track pending deliveries for people who were told to follow first
CREATE TABLE IF NOT EXISTS public.instagram_pending_deliveries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id)               ON DELETE CASCADE,
  ig_account_id      UUID NOT NULL REFERENCES instagram_accounts(id)       ON DELETE CASCADE,
  automation_id      UUID NOT NULL REFERENCES instagram_comment_automations(id) ON DELETE CASCADE,

  -- Who is waiting
  commenter_id       TEXT NOT NULL,   -- IGSID of the person who commented
  commenter_username TEXT,

  -- What to deliver
  dm_text            TEXT NOT NULL,   -- the lead magnet / resource message to send

  -- State
  status             TEXT NOT NULL DEFAULT 'waiting_follow'
                     CHECK (status IN ('waiting_follow', 'delivered', 'expired')),
  delivered_at       TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ig_pending_commenter
  ON public.instagram_pending_deliveries (ig_account_id, commenter_id)
  WHERE status = 'waiting_follow';

CREATE INDEX IF NOT EXISTS idx_ig_pending_expires
  ON public.instagram_pending_deliveries (expires_at)
  WHERE status = 'waiting_follow';

-- RLS
ALTER TABLE public.instagram_pending_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY ig_pending_own ON public.instagram_pending_deliveries
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role can write pending deliveries from webhooks
CREATE POLICY ig_pending_service ON public.instagram_pending_deliveries
  FOR ALL USING (TRUE);
