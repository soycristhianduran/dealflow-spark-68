ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS trigger_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS triggers jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.automations
SET trigger_types = ARRAY[trigger_type],
    triggers = jsonb_build_array(jsonb_build_object('type', trigger_type, 'config', COALESCE(trigger_config, '{}'::jsonb)))
WHERE (trigger_types IS NULL OR array_length(trigger_types,1) IS NULL) AND trigger_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_automations_trigger_types ON public.automations USING GIN (trigger_types);
