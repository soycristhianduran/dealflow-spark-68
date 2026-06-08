-- Add buttons support for the non-follower DM message
-- The follower DM already has dm_buttons (JSONB).
ALTER TABLE public.instagram_comment_automations
  ADD COLUMN IF NOT EXISTS dm_buttons_non_follower JSONB;

COMMENT ON COLUMN public.instagram_comment_automations.dm_buttons_non_follower IS
  'Optional URL buttons for the non-follower DM. Same format as dm_buttons: [{title, url}].';
