-- Support multiple media IDs per automation (user can target several posts with one rule)
ALTER TABLE public.instagram_comment_automations
  ADD COLUMN IF NOT EXISTS media_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Migrate existing single media_id → array
UPDATE public.instagram_comment_automations
  SET media_ids = ARRAY[media_id]
  WHERE media_id IS NOT NULL AND array_length(media_ids, 1) IS NULL;

CREATE INDEX IF NOT EXISTS idx_ig_automations_media_ids
  ON public.instagram_comment_automations USING GIN (media_ids);
