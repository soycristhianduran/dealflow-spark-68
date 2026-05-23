-- Add email sender fields to organizations table
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS email_from_name  TEXT,
  ADD COLUMN IF NOT EXISTS email_from_email TEXT;
