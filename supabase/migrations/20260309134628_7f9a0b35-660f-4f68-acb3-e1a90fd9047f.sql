
-- Create channels table for multi-channel support
CREATE TABLE public.channels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'whatsapp',
  provider text NOT NULL DEFAULT 'meta',
  business_account_id text,
  waba_id text,
  phone_number_id text,
  access_token text,
  webhook_verify_token text,
  display_phone text,
  business_name text,
  is_active boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  connected_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

-- RLS policy: users manage own channels
CREATE POLICY "Users manage own channels"
ON public.channels
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Unique constraint per user+type+phone
CREATE UNIQUE INDEX channels_user_type_phone_idx ON public.channels (user_id, type, phone_number_id) WHERE phone_number_id IS NOT NULL;
