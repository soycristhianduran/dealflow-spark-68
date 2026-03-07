
-- Add custom_fields JSONB column to contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}'::jsonb;

-- Create facebook_field_mappings table
CREATE TABLE IF NOT EXISTS public.facebook_field_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  form_id text NOT NULL,
  fb_field_name text NOT NULL,
  contact_field text NOT NULL,
  is_custom_field boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, form_id, fb_field_name)
);

ALTER TABLE public.facebook_field_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own field mappings"
ON public.facebook_field_mappings
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
