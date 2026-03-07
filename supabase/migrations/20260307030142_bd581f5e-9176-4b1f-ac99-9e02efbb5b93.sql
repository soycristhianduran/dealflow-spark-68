
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
