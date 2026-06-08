-- Add 'new_follower' as a valid trigger type
ALTER TABLE public.instagram_comment_automations
  DROP CONSTRAINT IF EXISTS instagram_comment_automations_trigger_type_check;

ALTER TABLE public.instagram_comment_automations
  ADD CONSTRAINT instagram_comment_automations_trigger_type_check
  CHECK (trigger_type IN ('comment', 'story_reply', 'story_mention', 'new_follower'));
