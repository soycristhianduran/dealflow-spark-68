-- ============================================================================
-- Auto-populate organization_id on facebook table inserts
-- ============================================================================
-- After the security hardening migration (20260529100000), facebook_pages,
-- facebook_lead_forms and facebook_field_mappings have org-scoped RLS.
-- The Edge Functions (facebook-api, setup-meta-tables) don't pass
-- organization_id on INSERT/UPSERT — they only pass user_id.
-- This migration wires the existing set_organization_id_on_insert trigger
-- (defined in 20260518110000) to those three tables so new rows
-- automatically get the correct organization_id from auth.uid() or user_id.
-- ============================================================================

-- facebook_pages
DROP TRIGGER IF EXISTS set_organization_id_trigger ON public.facebook_pages;
CREATE TRIGGER set_organization_id_trigger
  BEFORE INSERT ON public.facebook_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id_on_insert('user_id');

-- facebook_lead_forms
DROP TRIGGER IF EXISTS set_organization_id_trigger ON public.facebook_lead_forms;
CREATE TRIGGER set_organization_id_trigger
  BEFORE INSERT ON public.facebook_lead_forms
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id_on_insert('user_id');

-- facebook_field_mappings
DROP TRIGGER IF EXISTS set_organization_id_trigger ON public.facebook_field_mappings;
CREATE TRIGGER set_organization_id_trigger
  BEFORE INSERT ON public.facebook_field_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id_on_insert('user_id');
