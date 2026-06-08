-- Replace single trigger_type with trigger_types array
-- so one automation can fire on comment + story_reply + story_mention

ALTER TABLE public.instagram_comment_automations
  ADD COLUMN IF NOT EXISTS trigger_types TEXT[] NOT NULL DEFAULT ARRAY['comment'];

-- Migrate existing single values to array
UPDATE public.instagram_comment_automations
  SET trigger_types = ARRAY[trigger_type]
  WHERE trigger_types = ARRAY['comment'] AND trigger_type <> 'comment';

-- Update existing rows that already have trigger_type set
UPDATE public.instagram_comment_automations
  SET trigger_types = ARRAY[trigger_type];

CREATE INDEX IF NOT EXISTS idx_ig_automations_trigger_types
  ON public.instagram_comment_automations USING GIN (trigger_types)
  WHERE is_active = TRUE;
