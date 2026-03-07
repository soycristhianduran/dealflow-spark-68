
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS birthday date;
