-- =============================================
-- COMBINED MIGRATIONS for project 'CRM'
-- Generated Thu May  7 23:54:17 -05 2026
-- Files included (in order):
--   20260307030142_bd581f5e-9176-4b1f-ac99-9e02efbb5b93.sql
--   20260307053550_44290984-bb66-45ac-a577-57d822cebae1.sql
--   20260307130313_cbdd9fcf-a810-4a44-ac2e-1657c22c694c.sql
--   20260307132502_dbc3b935-11f5-418c-9ad9-94f169c153c0.sql
--   20260307153712_fafa83c1-3daa-4648-8148-78ae33e390d2.sql
--   20260307160931_b50c0e51-d402-434e-b078-d5a41db031d3.sql
--   20260307162457_22a82157-28fe-43b7-b2a2-f96509da2146.sql
--   20260307164123_3dcf394c-d1ff-491a-a1c2-76a045fc4f3c.sql
--   20260309005046_4079f965-8bc3-40b9-abed-bbabb8ddd39d.sql
--   20260309134628_7f9a0b35-660f-4f68-acb3-e1a90fd9047f.sql
--   20260320042320_19dfc05e-467b-4c22-895e-24665952a191.sql
-- =============================================

-- ===== START 20260307030142_bd581f5e-9176-4b1f-ac99-9e02efbb5b93.sql =====

-- Companies table
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  industry TEXT,
  company_size TEXT,
  city TEXT,
  country TEXT,
  website TEXT,
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view companies" ON public.companies
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert companies" ON public.companies
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update companies" ON public.companies
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete companies" ON public.companies
  FOR DELETE TO authenticated USING (true);

-- Contacts table (unified leads + contacts)
CREATE TABLE public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  primary_phone TEXT,
  primary_email TEXT,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  preferred_channel TEXT,
  language TEXT,
  timezone TEXT,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  last_contact_at TIMESTAMPTZ,
  next_action_at TIMESTAMPTZ,
  owner_id UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'new',
  score INTEGER DEFAULT 0,
  source TEXT,
  campaign TEXT,
  adset TEXT,
  ad TEXT,
  landing_page TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  country TEXT,
  city TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view contacts" ON public.contacts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert contacts" ON public.contacts
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update contacts" ON public.contacts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete contacts" ON public.contacts
  FOR DELETE TO authenticated USING (true);

-- Pipelines table
CREATE TABLE public.pipelines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage pipelines" ON public.pipelines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Pipeline stages
CREATE TABLE public.pipeline_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  probability INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage stages" ON public.pipeline_stages
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Deals table
CREATE TABLE public.deals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  pipeline_id UUID REFERENCES public.pipelines(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES auth.users(id),
  value NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  close_probability INTEGER,
  expected_close_date DATE,
  source TEXT,
  product TEXT,
  lost_reason TEXT,
  won_reason TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view deals" ON public.deals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert deals" ON public.deals
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update deals" ON public.deals
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete deals" ON public.deals
  FOR DELETE TO authenticated USING (true);

-- Tasks table
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL DEFAULT 'follow_up',
  priority TEXT NOT NULL DEFAULT 'medium',
  due_date DATE,
  due_time TIME,
  status TEXT NOT NULL DEFAULT 'pending',
  owner_id UUID REFERENCES auth.users(id),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage tasks" ON public.tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Meetings table
CREATE TABLE public.meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  timezone TEXT,
  advisor_id UUID REFERENCES auth.users(id),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  attendance_status TEXT DEFAULT 'pending',
  meeting_type TEXT,
  location_or_link TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage meetings" ON public.meetings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Activities / Timeline table
CREATE TABLE public.activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  related_entity_type TEXT NOT NULL,
  related_entity_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  event_source TEXT,
  summary TEXT NOT NULL,
  payload JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage activities" ON public.activities
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Insert default pipeline and stages
INSERT INTO public.pipelines (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Pipeline principal');

INSERT INTO public.pipeline_stages (id, pipeline_id, name, "order", color, probability) VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Lead nuevo', 1, 'hsl(220, 70%, 50%)', 10),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Contactado', 2, 'hsl(262, 52%, 47%)', 20),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Cita agendada', 3, 'hsl(38, 92%, 50%)', 35),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Cita realizada', 4, 'hsl(25, 95%, 53%)', 50),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Propuesta enviada', 5, 'hsl(173, 58%, 39%)', 65),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Negociación', 6, 'hsl(199, 89%, 48%)', 80),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Cerrado ganado', 7, 'hsl(142, 71%, 45%)', 100),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Cerrado perdido', 8, 'hsl(0, 72%, 51%)', 0);

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.deals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activities;

-- ===== END 20260307030142_bd581f5e-9176-4b1f-ac99-9e02efbb5b93.sql =====

-- ===== START 20260307053550_44290984-bb66-45ac-a577-57d822cebae1.sql =====

-- Create storage bucket for company logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true);

-- Allow authenticated users to upload logos
CREATE POLICY "Authenticated users can upload logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'company-logos');

-- Allow authenticated users to update logos
CREATE POLICY "Authenticated users can update logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'company-logos')
WITH CHECK (bucket_id = 'company-logos');

-- Allow authenticated users to delete logos
CREATE POLICY "Authenticated users can delete logos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'company-logos');

-- Allow public read access to logos
CREATE POLICY "Public read access for logos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'company-logos');

-- ===== END 20260307053550_44290984-bb66-45ac-a577-57d822cebae1.sql =====

-- ===== START 20260307130313_cbdd9fcf-a810-4a44-ac2e-1657c22c694c.sql =====
CREATE TABLE public.google_calendar_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider_token text NOT NULL,
  provider_refresh_token text,
  connected_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own tokens"
  ON public.google_calendar_tokens
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
-- ===== END 20260307130313_cbdd9fcf-a810-4a44-ac2e-1657c22c694c.sql =====

-- ===== START 20260307132502_dbc3b935-11f5-418c-9ad9-94f169c153c0.sql =====
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
-- ===== END 20260307132502_dbc3b935-11f5-418c-9ad9-94f169c153c0.sql =====

-- ===== START 20260307153712_fafa83c1-3daa-4648-8148-78ae33e390d2.sql =====
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
-- ===== END 20260307153712_fafa83c1-3daa-4648-8148-78ae33e390d2.sql =====

-- ===== START 20260307160931_b50c0e51-d402-434e-b078-d5a41db031d3.sql =====

DROP POLICY IF EXISTS "Users manage own meta campaigns" ON public.meta_campaigns;
CREATE POLICY "Users manage own meta campaigns"
ON public.meta_campaigns
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ===== END 20260307160931_b50c0e51-d402-434e-b078-d5a41db031d3.sql =====

-- ===== START 20260307162457_22a82157-28fe-43b7-b2a2-f96509da2146.sql =====

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

-- ===== END 20260307162457_22a82157-28fe-43b7-b2a2-f96509da2146.sql =====

-- ===== START 20260307164123_3dcf394c-d1ff-491a-a1c2-76a045fc4f3c.sql =====

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS birthday date;

-- ===== END 20260307164123_3dcf394c-d1ff-491a-a1c2-76a045fc4f3c.sql =====

-- ===== START 20260309005046_4079f965-8bc3-40b9-abed-bbabb8ddd39d.sql =====

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

-- ===== END 20260309005046_4079f965-8bc3-40b9-abed-bbabb8ddd39d.sql =====

-- ===== START 20260309134628_7f9a0b35-660f-4f68-acb3-e1a90fd9047f.sql =====

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

-- ===== END 20260309134628_7f9a0b35-660f-4f68-acb3-e1a90fd9047f.sql =====

-- ===== START 20260320042320_19dfc05e-467b-4c22-895e-24665952a191.sql =====

-- Create profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  first_name text,
  last_name text,
  phone text,
  avatar_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own profile
CREATE POLICY "Users manage own profile"
  ON public.profiles
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create avatars storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true);

-- Storage policies for avatars
CREATE POLICY "Users can upload own avatar"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own avatar"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own avatar"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Anyone can view avatars"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

-- ===== END 20260320042320_19dfc05e-467b-4c22-895e-24665952a191.sql =====

