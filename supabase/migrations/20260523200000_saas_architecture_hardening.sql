-- ============================================================================
-- SaaS Architecture Hardening
-- ============================================================================
-- Fixes 6 architectural issues so every feature works correctly in a
-- multi-tenant (org-scoped) environment:
--
--   #1  email_campaigns    — user_id RLS  → is_org_member(organization_id)
--   #2  email_sends        — user_id RLS  → is_org_member(organization_id)
--   #3  whatsapp_campaigns — user_id RLS  → is_org_member(organization_id)
--   #4  whatsapp_sends     — add org col  + user_id RLS  → is_org_member
--   #5  automations        — add org col  + user_id RLS  → is_org_member
--   #6  email_templates    — add org col  + user_id RLS  → is_org_member
--                            (so teammates share the same template library)
--   #7  consume_email_quota(org_id, amount) — new SECURITY DEFINER function
--                            that atomically upserts usage_counters.email_sends_used
--                            Called by the send-email edge function on every send.
--
-- Prerequisites: migrations 20260518110000 (defines is_org_member,
-- auth_user_org_id, set_organization_id_on_insert) and 20260523100000
-- (adds organization_id columns to email_campaigns, email_sends,
-- whatsapp_campaigns) must have been applied first. This migration is
-- idempotent: all column additions use IF NOT EXISTS, all trigger installs
-- use DROP TRIGGER IF EXISTS, all policy drops use IF EXISTS.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add organization_id to tables that don't have it yet
-- ─────────────────────────────────────────────────────────────────────────────
-- (email_campaigns, email_sends, whatsapp_campaigns already got it in
-- 20260523100000 — the IF NOT EXISTS guard makes those no-ops here.)

ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.email_sends
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.whatsapp_campaigns
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.whatsapp_sends
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Backfill organization_id from user_id via organization_members
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.email_campaigns ec
SET organization_id = m.organization_id
FROM public.organization_members m
WHERE ec.organization_id IS NULL
  AND ec.user_id IS NOT NULL
  AND m.user_id = ec.user_id;

UPDATE public.email_sends es
SET organization_id = m.organization_id
FROM public.organization_members m
WHERE es.organization_id IS NULL
  AND es.user_id IS NOT NULL
  AND m.user_id = es.user_id;

-- email_sends without direct user_id: inherit from campaign
UPDATE public.email_sends es
SET organization_id = ec.organization_id
FROM public.email_campaigns ec
WHERE es.organization_id IS NULL
  AND es.campaign_id = ec.id
  AND ec.organization_id IS NOT NULL;

UPDATE public.whatsapp_campaigns wc
SET organization_id = m.organization_id
FROM public.organization_members m
WHERE wc.organization_id IS NULL
  AND wc.user_id IS NOT NULL
  AND m.user_id = wc.user_id;

UPDATE public.whatsapp_sends ws
SET organization_id = m.organization_id
FROM public.organization_members m
WHERE ws.organization_id IS NULL
  AND ws.user_id IS NOT NULL
  AND m.user_id = ws.user_id;

-- whatsapp_sends without user_id: inherit from campaign
UPDATE public.whatsapp_sends ws
SET organization_id = wc.organization_id
FROM public.whatsapp_campaigns wc
WHERE ws.organization_id IS NULL
  AND ws.campaign_id = wc.id
  AND wc.organization_id IS NOT NULL;

UPDATE public.automations a
SET organization_id = m.organization_id
FROM public.organization_members m
WHERE a.organization_id IS NULL
  AND a.user_id IS NOT NULL
  AND m.user_id = a.user_id;

UPDATE public.email_templates et
SET organization_id = m.organization_id
FROM public.organization_members m
WHERE et.organization_id IS NULL
  AND et.user_id IS NOT NULL
  AND m.user_id = et.user_id;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Indexes for org-scoping predicate
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_email_campaigns_organization_id
  ON public.email_campaigns(organization_id);

CREATE INDEX IF NOT EXISTS idx_email_sends_organization_id
  ON public.email_sends(organization_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_organization_id
  ON public.whatsapp_campaigns(organization_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sends_organization_id
  ON public.whatsapp_sends(organization_id);

CREATE INDEX IF NOT EXISTS idx_automations_organization_id
  ON public.automations(organization_id);

CREATE INDEX IF NOT EXISTS idx_email_templates_organization_id
  ON public.email_templates(organization_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Auto-populate organization_id on INSERT via existing trigger function
-- ─────────────────────────────────────────────────────────────────────────────
-- set_organization_id_on_insert() is defined in 20260518110000. It reads
-- auth.uid() → organization_members to find the org, falling back to a named
-- user-id column on the row itself.

DO $$
DECLARE
  spec TEXT[];
BEGIN
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['email_campaigns',    'user_id'],
    ARRAY['email_sends',        'user_id'],
    ARRAY['whatsapp_campaigns', 'user_id'],
    ARRAY['whatsapp_sends',     'user_id'],
    ARRAY['automations',        'user_id'],
    ARRAY['email_templates',    'user_id']
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_organization_id_trigger ON public.%I;',
      spec[1]
    );
    EXECUTE format(
      'CREATE TRIGGER set_organization_id_trigger
         BEFORE INSERT ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.set_organization_id_on_insert(%L);',
      spec[1], spec[2]
    );
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Drop ALL existing policies on these tables (catch any stray ones)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  tbl TEXT;
  pol RECORD;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'email_campaigns', 'email_sends',
    'whatsapp_campaigns', 'whatsapp_sends',
    'automations', 'email_templates'
  ] LOOP
    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Org-scoped RLS policies
-- ─────────────────────────────────────────────────────────────────────────────
-- Full CRUD via is_org_member(organization_id). Rows without org_id are
-- invisible to regular users (is_org_member returns FALSE for NULL input).

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'email_campaigns', 'email_sends',
    'whatsapp_campaigns', 'whatsapp_sends',
    'automations', 'email_templates'
  ] LOOP
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


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. consume_email_quota — atomically increments billing counter
-- ─────────────────────────────────────────────────────────────────────────────
-- Called by the send-email Edge Function after every successful send batch.
-- Uses UPSERT so the counter row is created automatically if this is the
-- first send of the month. Safe to call from service-role context.

CREATE OR REPLACE FUNCTION public.consume_email_quota(
  p_org_id UUID,
  p_amount  INTEGER DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_start TIMESTAMPTZ := date_trunc('month', now());
  p_end   TIMESTAMPTZ := date_trunc('month', now()) + INTERVAL '1 month';
BEGIN
  IF p_org_id IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.usage_counters (
    organization_id,
    period_start,
    period_end,
    email_sends_used
  )
  VALUES (
    p_org_id,
    p_start,
    p_end,
    p_amount
  )
  ON CONFLICT (organization_id, period_start)
  DO UPDATE SET
    email_sends_used = usage_counters.email_sends_used + EXCLUDED.email_sends_used,
    updated_at       = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_email_quota(UUID, INTEGER) TO service_role;

COMMENT ON FUNCTION public.consume_email_quota(UUID, INTEGER) IS
  'Atomically increments email_sends_used in usage_counters for the given org and current billing period. Called by the send-email Edge Function.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Orphan report (NOTICEs only — does not block migration)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  tbl TEXT;
  cnt BIGINT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'email_campaigns', 'email_sends',
    'whatsapp_campaigns', 'whatsapp_sends',
    'automations', 'email_templates'
  ] LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE organization_id IS NULL', tbl
    ) INTO cnt;
    IF cnt > 0 THEN
      RAISE NOTICE '[saas-hardening] % rows in public.%.organization_id are NULL — they will be invisible to end users until manually reassigned',
        cnt, tbl;
    END IF;
  END LOOP;
END $$;
