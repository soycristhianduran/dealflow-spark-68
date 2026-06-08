-- ============================================================
-- Instagram Story automations
-- Adds trigger_type to instagram_comment_automations so the
-- same table handles:
--   'comment'       → someone comments on a post (existing)
--   'story_reply'   → someone replies to your story
--   'story_mention' → someone mentions @you in their story
-- ============================================================

ALTER TABLE public.instagram_comment_automations
  ADD COLUMN IF NOT EXISTS trigger_type TEXT NOT NULL DEFAULT 'comment'
    CHECK (trigger_type IN ('comment', 'story_reply', 'story_mention'));

COMMENT ON COLUMN public.instagram_comment_automations.trigger_type IS
  'What triggers this automation: comment on post, reply to your story, or mention in someone else''s story.';

CREATE INDEX IF NOT EXISTS idx_ig_automations_trigger_type
  ON public.instagram_comment_automations (trigger_type, is_active)
  WHERE is_active = TRUE;
