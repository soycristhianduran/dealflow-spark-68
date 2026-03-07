-- Facebook integration tokens per user
CREATE TABLE public.facebook_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  access_token text NOT NULL,
  token_expires_at timestamp with time zone,
  connected_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE public.facebook_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own fb tokens" ON public.facebook_tokens FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Facebook pages selected by each user
CREATE TABLE public.facebook_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  page_id text NOT NULL,
  page_name text NOT NULL,
  page_access_token text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, page_id)
);
ALTER TABLE public.facebook_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own fb pages" ON public.facebook_pages FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Lead forms linked to pages
CREATE TABLE public.facebook_lead_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  page_id text NOT NULL,
  form_id text NOT NULL,
  form_name text NOT NULL,
  form_status text DEFAULT 'active',
  is_syncing boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, form_id)
);
ALTER TABLE public.facebook_lead_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own fb forms" ON public.facebook_lead_forms FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Messenger conversations captured
CREATE TABLE public.facebook_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  page_id text NOT NULL,
  sender_id text NOT NULL,
  sender_name text,
  message_text text,
  message_id text NOT NULL,
  sent_at timestamp with time zone NOT NULL,
  direction text NOT NULL DEFAULT 'incoming',
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(message_id)
);
ALTER TABLE public.facebook_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own fb messages" ON public.facebook_messages FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Meta Ads campaign history
CREATE TABLE public.meta_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  campaign_id text NOT NULL,
  campaign_name text NOT NULL,
  status text,
  objective text,
  daily_budget numeric,
  lifetime_budget numeric,
  spend numeric DEFAULT 0,
  impressions integer DEFAULT 0,
  clicks integer DEFAULT 0,
  leads integer DEFAULT 0,
  cpl numeric,
  start_time timestamp with time zone,
  stop_time timestamp with time zone,
  ad_account_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, campaign_id)
);
ALTER TABLE public.meta_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own meta campaigns" ON public.meta_campaigns FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);