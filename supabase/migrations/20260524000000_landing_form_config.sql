-- Add form_config JSONB column to landing_pages
-- Stores field definitions, CRM mappings, and pipeline assignment for each landing's form
ALTER TABLE public.landing_pages
  ADD COLUMN IF NOT EXISTS form_config JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.landing_pages.form_config IS
  'JSON: { fields:[{id,label,name,type,required,placeholder,crm_field}], pipeline_id, stage_id, pipeline_name, stage_name, cta_text, success_message }';
