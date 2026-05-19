-- ============================================================================
-- Multi-tenant RLS hardening for core CRM tables
-- ============================================================================
-- Before this migration, the policies on companies, contacts, pipelines,
-- pipeline_stages, deals, tasks, meetings and activities were
-- `USING (true)` — every authenticated user could read and modify every
-- other tenant's data. None of these tables even had an `organization_id`
-- column.
--
-- This migration:
--   1. Adds nullable `organization_id` to every affected table
--   2. Backfills it from `owner_id` / `advisor_id` / `created_by` via
--      organization_members
--   3. Indexes it
--   4. Adds a BEFORE INSERT trigger that auto-populates the column from
--      `auth.uid()` so existing application code (which never set
--      organization_id) keeps working without changes
--   5. Drops the broken `USING (true)` policies and replaces them with
--      org-scoped ones that delegate to a SECURITY DEFINER helper
--
-- Backward compatibility: any existing row that couldn't be backfilled
-- (e.g. owner_id was NULL, or the owner is no longer a member of any org)
-- ends up with `organization_id = NULL`. Those rows become invisible to
-- the application. This is the safest default — better to lose visibility
-- than to leak across tenants. An admin can manually reassign by setting
-- organization_id on each orphaned row via psql / service role.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Helper functions
-- ─────────────────────────────────────────────────────────────────────────────
-- All helpers run as SECURITY DEFINER so they bypass RLS on
-- organization_members itself (otherwise we'd hit the infinite recursion
-- that 20260514000000 already fixed once).

CREATE OR REPLACE FUNCTION public.auth_user_org_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  -- Returns the organization_id of the currently authenticated user, or
  -- NULL if they have no membership yet. If the user belongs to multiple
  -- organizations (rare but legal), returns the one they joined first.
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = auth.uid()
  ORDER BY created_at ASC NULLS LAST
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.auth_user_org_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    p_org_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_members
      WHERE user_id = auth.uid()
        AND organization_id = p_org_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_org_member(UUID) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add nullable organization_id to every affected table
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.companies        ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.contacts         ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.pipelines        ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.pipeline_stages  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.deals            ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.tasks            ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.meetings         ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.activities       ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Backfill organization_id from existing user-identifying columns
-- ─────────────────────────────────────────────────────────────────────────────
-- Order matters: pipelines / pipeline_stages backfill via deals, so deals
-- must be filled first. Activities backfill last in case we want to use
-- their related entity.

UPDATE public.companies c
SET organization_id = m.organization_id
FROM public.organization_members m
WHERE c.organization_id IS NULL
  AND c.owner_id IS NOT NULL
  AND m.user_id = c.owner_id;

UPDATE public.contacts c
SET organization_id = m.organization_id
FROM public.organization_members m
WHERE c.organization_id IS NULL
  AND c.owner_id IS NOT NULL
  AND m.user_id = c.owner_id;

UPDATE public.deals d
SET organization_id = m.organization_id
FROM public.organization_members m
WHERE d.organization_id IS NULL
  AND d.owner_id IS NOT NULL
  AND m.user_id = d.owner_id;

-- For deals without owner_id, fall back to the related contact's org
UPDATE public.deals d
SET organization_id = c.organization_id
FROM public.contacts c
WHERE d.organization_id IS NULL
  AND d.contact_id = c.id
  AND c.organization_id IS NOT NULL;

UPDATE public.tasks t
SET organization_id = m.organization_id
FROM public.organization_members m
WHERE t.organization_id IS NULL
  AND t.owner_id IS NOT NULL
  AND m.user_id = t.owner_id;

-- Tasks without owner: fall back to related deal or contact org
UPDATE public.tasks t
SET organization_id = d.organization_id
FROM public.deals d
WHERE t.organization_id IS NULL
  AND t.deal_id = d.id
  AND d.organization_id IS NOT NULL;

UPDATE public.tasks t
SET organization_id = c.organization_id
FROM public.contacts c
WHERE t.organization_id IS NULL
  AND t.contact_id = c.id
  AND c.organization_id IS NOT NULL;

UPDATE public.meetings mt
SET organization_id = m.organization_id
FROM public.organization_members m
WHERE mt.organization_id IS NULL
  AND mt.advisor_id IS NOT NULL
  AND m.user_id = mt.advisor_id;

UPDATE public.activities a
SET organization_id = m.organization_id
FROM public.organization_members m
WHERE a.organization_id IS NULL
  AND a.created_by IS NOT NULL
  AND m.user_id = a.created_by;

-- Pipelines: backfill from any deal that uses this pipeline. Pipelines
-- with no deals stay NULL — they're system templates (e.g. the seeded
-- "Pipeline principal") that any org can see read-only.
UPDATE public.pipelines p
SET organization_id = sub.organization_id
FROM (
  SELECT DISTINCT ON (pipeline_id) pipeline_id, organization_id
  FROM public.deals
  WHERE pipeline_id IS NOT NULL AND organization_id IS NOT NULL
) sub
WHERE p.organization_id IS NULL
  AND p.id = sub.pipeline_id;

-- Pipeline stages: inherit from their parent pipeline
UPDATE public.pipeline_stages ps
SET organization_id = p.organization_id
FROM public.pipelines p
WHERE ps.organization_id IS NULL
  AND ps.pipeline_id = p.id
  AND p.organization_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Indexes for the org-scoping predicate (every RLS check uses it)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_companies_organization_id       ON public.companies(organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_organization_id        ON public.contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_organization_id       ON public.pipelines(organization_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_organization_id ON public.pipeline_stages(organization_id);
CREATE INDEX IF NOT EXISTS idx_deals_organization_id           ON public.deals(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_organization_id           ON public.tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_meetings_organization_id        ON public.meetings(organization_id);
CREATE INDEX IF NOT EXISTS idx_activities_organization_id      ON public.activities(organization_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Auto-populate trigger for INSERTs that omit organization_id
-- ─────────────────────────────────────────────────────────────────────────────
-- The current application code (and several Edge Functions running with the
-- service role) never set organization_id on INSERT. This trigger fills it
-- automatically using a two-step fallback chain:
--
--   1. If the caller is an end user (auth.uid() set) → use their primary org
--   2. Else, if the row has a user column (owner_id / advisor_id / created_by)
--      that we can look up in organization_members → use that user's org
--
-- The user-column to inspect is passed as a trigger argument so the same
-- function works for every table.
--
-- Service-role inserts that don't pass any user column will fall through
-- to NULL — the row is created (RLS is bypassed for service_role) but
-- becomes invisible to end users, which surfaces the bug immediately.

CREATE OR REPLACE FUNCTION public.set_organization_id_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_col TEXT;
  user_val UUID;
  derived  UUID;
  new_json JSONB;
BEGIN
  -- Caller explicitly supplied organization_id — keep it.
  IF NEW.organization_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Step 1: derive from the authenticated user, if any.
  NEW.organization_id := public.auth_user_org_id();
  IF NEW.organization_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Step 2: derive from a user-id column on this row.
  user_col := TG_ARGV[0];
  IF user_col IS NOT NULL AND user_col <> '' THEN
    new_json := to_jsonb(NEW);
    user_val := NULLIF(new_json ->> user_col, '')::UUID;
    IF user_val IS NOT NULL THEN
      SELECT organization_id INTO derived
      FROM public.organization_members
      WHERE user_id = user_val
      ORDER BY created_at ASC NULLS LAST
      LIMIT 1;
      NEW.organization_id := derived;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Wire the trigger up per-table with the right user-column hint.
DO $$
DECLARE
  spec TEXT[];
  parts TEXT[];
  tbl TEXT;
  user_col TEXT;
BEGIN
  -- table_name : user_id column (or '' if none)
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['companies',       'owner_id'],
    ARRAY['contacts',        'owner_id'],
    ARRAY['pipelines',       ''],
    ARRAY['pipeline_stages', ''],
    ARRAY['deals',           'owner_id'],
    ARRAY['tasks',           'owner_id'],
    ARRAY['meetings',        'advisor_id'],
    ARRAY['activities',      'created_by']
  ] LOOP
    tbl := spec[1];
    user_col := spec[2];
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_organization_id_trigger ON public.%I;',
      tbl
    );
    EXECUTE format(
      'CREATE TRIGGER set_organization_id_trigger
        BEFORE INSERT ON public.%I
        FOR EACH ROW EXECUTE FUNCTION public.set_organization_id_on_insert(%L);',
      tbl, user_col
    );
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Drop ALL existing policies on the affected tables
-- ─────────────────────────────────────────────────────────────────────────────
-- Use a generic loop so we catch any stray policy added in dev/manually
-- via Supabase dashboard.

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


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Org-scoped policies
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT/INSERT/UPDATE/DELETE all require `is_org_member(organization_id)`
-- for the row in question. NULL organization_id rows are invisible (the
-- helper returns FALSE for NULL input).
--
-- Pipelines & pipeline_stages get a small extension: rows with
-- organization_id IS NULL are treated as system templates — readable by
-- anyone authenticated, but immutable (no UPDATE/DELETE policy matches
-- NULL rows, so they're protected). This lets the seeded "Pipeline
-- principal" remain visible without forcing every org to have its own
-- copy.

-- 7a. Tables WITHOUT the "system template" exception ----------------------
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['companies', 'contacts', 'deals', 'tasks', 'meetings', 'activities']
  LOOP
    EXECUTE format($f$
      CREATE POLICY "%1$s_org_select" ON public.%1$I
        FOR SELECT TO authenticated
        USING (public.is_org_member(organization_id));

      CREATE POLICY "%1$s_org_insert" ON public.%1$I
        FOR INSERT TO authenticated
        WITH CHECK (public.is_org_member(organization_id));

      CREATE POLICY "%1$s_org_update" ON public.%1$I
        FOR UPDATE TO authenticated
        USING (public.is_org_member(organization_id))
        WITH CHECK (public.is_org_member(organization_id));

      CREATE POLICY "%1$s_org_delete" ON public.%1$I
        FOR DELETE TO authenticated
        USING (public.is_org_member(organization_id));
    $f$, tbl);
  END LOOP;
END $$;

-- 7b. Pipelines & pipeline_stages — SELECT also matches system templates -
CREATE POLICY "pipelines_org_select" ON public.pipelines
  FOR SELECT TO authenticated
  USING (organization_id IS NULL OR public.is_org_member(organization_id));

CREATE POLICY "pipelines_org_insert" ON public.pipelines
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "pipelines_org_update" ON public.pipelines
  FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "pipelines_org_delete" ON public.pipelines
  FOR DELETE TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "pipeline_stages_org_select" ON public.pipeline_stages
  FOR SELECT TO authenticated
  USING (organization_id IS NULL OR public.is_org_member(organization_id));

CREATE POLICY "pipeline_stages_org_insert" ON public.pipeline_stages
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "pipeline_stages_org_update" ON public.pipeline_stages
  FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "pipeline_stages_org_delete" ON public.pipeline_stages
  FOR DELETE TO authenticated
  USING (public.is_org_member(organization_id));


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Visibility report (orphaned rows that need manual reassignment)
-- ─────────────────────────────────────────────────────────────────────────────
-- This block emits NOTICEs the first time the migration runs so the
-- operator can spot data that lost visibility. It does NOT block the
-- migration — orphans are an existing-data-quality issue, not a schema
-- issue.

DO $$
DECLARE
  tbl TEXT;
  cnt BIGINT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'companies', 'contacts', 'deals', 'tasks', 'meetings', 'activities'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id IS NULL', tbl)
      INTO cnt;
    IF cnt > 0 THEN
      RAISE NOTICE '[org-scoping] % rows in %.organization_id remain NULL — manually reassign or they will be invisible',
        cnt, tbl;
    END IF;
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Documentation
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON FUNCTION public.auth_user_org_id() IS
  'Returns the organization_id of the currently authenticated user. Used by the set_organization_id_on_insert trigger to auto-populate org_id on new rows.';

COMMENT ON FUNCTION public.is_org_member(UUID) IS
  'Returns TRUE if the currently authenticated user is a member of the given organization. Used by every org-scoped RLS policy.';

COMMENT ON COLUMN public.companies.organization_id  IS 'Owning organization (multi-tenant scope). Enforced by RLS via is_org_member().';
COMMENT ON COLUMN public.contacts.organization_id   IS 'Owning organization (multi-tenant scope). Enforced by RLS via is_org_member().';
COMMENT ON COLUMN public.pipelines.organization_id  IS 'Owning organization. NULL = system template visible read-only to everyone.';
COMMENT ON COLUMN public.deals.organization_id      IS 'Owning organization (multi-tenant scope). Enforced by RLS via is_org_member().';
COMMENT ON COLUMN public.tasks.organization_id      IS 'Owning organization (multi-tenant scope). Enforced by RLS via is_org_member().';
COMMENT ON COLUMN public.meetings.organization_id   IS 'Owning organization (multi-tenant scope). Enforced by RLS via is_org_member().';
COMMENT ON COLUMN public.activities.organization_id IS 'Owning organization (multi-tenant scope). Enforced by RLS via is_org_member().';
