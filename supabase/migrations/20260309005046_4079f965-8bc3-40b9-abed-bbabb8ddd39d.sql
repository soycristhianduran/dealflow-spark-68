
-- WhatsApp configuration per user (stores their Cloud API credentials)
CREATE TABLE public.whatsapp_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  phone_number_id TEXT NOT NULL,
  waba_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  display_phone TEXT,
  business_name TEXT,
  webhook_verified BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own whatsapp configs"
ON public.whatsapp_configs FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- WhatsApp messages history
CREATE TABLE public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  contact_id UUID REFERENCES public.contacts(id),
  wa_message_id TEXT,
  phone_number TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'outgoing',
  message_type TEXT NOT NULL DEFAULT 'text',
  message_text TEXT,
  media_url TEXT,
  status TEXT DEFAULT 'sent',
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own whatsapp messages"
ON public.whatsapp_messages FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
