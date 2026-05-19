-- ============================================================================
-- ROLLBACK SQL — revierte completamente las migraciones del 18 May 2026:
--   - 20260518100000_meta_data_deletion.sql
--   - 20260518110000_org_scoped_rls.sql
--
-- Cómo usar:
--   1. Abre Supabase Dashboard → SQL Editor
--   2. Pega TODO este archivo
--   3. Click "Run"
--   4. Verifica el output
--
-- Es 100% reversible y NO toca datos del CRM (solo borra columnas/funciones
-- que agregamos hoy + restaura las políticas wide-open `USING (true)`).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Drop org-scoped policies and restore the original `USING (true)` ones
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl TEXT;
  pol RECORD;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'companies', 'contacts', 'pipelines', 'pipeline_stages',
    'deals', 'tasks', 'meetings', 'activities'
  ] LOOP
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;
  END LOOP;
END $$;

-- Restore the original wide-open policies (matching the pre-migration state)
CREATE POLICY "Authenticated users can view companies" ON public.companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert companies" ON public.companies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update companies" ON public.companies FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete companies" ON public.companies FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view contacts" ON public.contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert contacts" ON public.contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update contacts" ON public.contacts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete contacts" ON public.contacts FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage pipelines" ON public.pipelines FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage stages" ON public.pipeline_stages FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can view deals" ON public.deals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert deals" ON public.deals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update deals" ON public.deals FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete deals" ON public.deals FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage tasks" ON public.tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage meetings" ON public.meetings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage activities" ON public.activities FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2. Drop the auto-population triggers (must drop before dropping the function)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'companies', 'contacts', 'pipelines', 'pipeline_stages',
    'deals', 'tasks', 'meetings', 'activities'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_organization_id_trigger ON public.%I;', tbl);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.set_organization_id_on_insert();

-- ---------------------------------------------------------------------------
-- 3. Drop helper functions
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.is_org_member(UUID);
DROP FUNCTION IF EXISTS public.auth_user_org_id();

-- ---------------------------------------------------------------------------
-- 4. Drop the organization_id columns from core tables
-- NOTE: This is destructive — any org_id values you'd populated will be lost.
--       The original `owner_id` columns are untouched so you can re-derive.
-- ---------------------------------------------------------------------------
ALTER TABLE public.companies        DROP COLUMN IF EXISTS organization_id;
ALTER TABLE public.contacts         DROP COLUMN IF EXISTS organization_id;
ALTER TABLE public.pipelines        DROP COLUMN IF EXISTS organization_id;
ALTER TABLE public.pipeline_stages  DROP COLUMN IF EXISTS organization_id;
ALTER TABLE public.deals            DROP COLUMN IF EXISTS organization_id;
ALTER TABLE public.tasks            DROP COLUMN IF EXISTS organization_id;
ALTER TABLE public.meetings         DROP COLUMN IF EXISTS organization_id;
ALTER TABLE public.activities       DROP COLUMN IF EXISTS organization_id;

-- ---------------------------------------------------------------------------
-- 5. Drop the data-deletion infrastructure (Meta callback)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.scrub_old_signed_requests();
DROP FUNCTION IF EXISTS public.get_data_deletion_status(TEXT);
DROP TABLE IF EXISTS public.data_deletion_requests;

ALTER TABLE public.facebook_tokens   DROP COLUMN IF EXISTS fb_user_id;
ALTER TABLE public.instagram_accounts DROP COLUMN IF EXISTS fb_user_id;

COMMIT;

-- Verify everything is gone:
SELECT 'Rollback complete. Remaining policies:' AS message;
SELECT tablename, COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('companies','contacts','pipelines','pipeline_stages','deals','tasks','meetings','activities')
GROUP BY tablename
ORDER BY tablename;
