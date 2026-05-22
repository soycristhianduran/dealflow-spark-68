-- ============================================================================
-- Org-scope WhatsApp & Instagram tables for true multi-agent SaaS access
-- ============================================================================
-- Before this migration, ALL WhatsApp and Instagram tables used:
--   USING (auth.uid() = user_id)
-- This meant only the admin who set up the integration could see ANY data.
-- Vendor/readonly agents could not see conversations or messages at all.
--
-- This migration mirrors the org-scoping approach from
-- 20260518110000_org_scoped_rls.sql:
--   1. Add nullable organization_id column
--   2. Backfill from user_id via organization_members
--   3. Wire the existing set_organization_id_on_insert trigger
--   4. Drop old user-scoped policies
--   5. Create org-scoped policies using is_org_member(organization_id)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add organization_id columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.whatsapp_configs
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.instagram_accounts
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.instagram_conversations
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.instagram_messages
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.instagram_comments
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.instagram_comment_automations
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Backfill organization_id from user_id via organization_members
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.whatsapp_configs c
SET organization_id = m.organization_id
FROM public.organization_members m
WHERE c.organization_id IS NULL AND m.user_id = c.user_id;

UPDATE public.whatsapp_messages c
SET organization_id = m.organization_id
FROM public.organization_members m
WHERE c.organization_id IS NULL AND m.user_id = c.user_id;

UPDATE public.instagram_accounts c
SET organization_id = m.organization_id
FROM public.organization_members m
WHERE c.organization_id IS NULL AND m.user_id = c.user_id;

UPDATE public.instagram_conversations c
SET organization_id = m.organization_id
FROM public.organization_members m
WHERE c.organization_id IS NULL AND m.user_id = c.user_id;

-- instagram_messages: try direct user_id first
UPDATE public.instagram_messages c
SET organization_id = m.organization_id
FROM public.organization_members m
WHERE c.organization_id IS NULL AND m.user_id = c.user_id;

-- instagram_messages without direct match: inherit from conversation
UPDATE public.instagram_messages msg
SET organization_id = conv.organization_id
FROM public.instagram_conversations conv
WHERE msg.organization_id IS NULL
  AND msg.conversation_id = conv.id
  AND conv.organization_id IS NOT NULL;

UPDATE public.instagram_comments c
SET organization_id = m.organization_id
FROM public.organization_members m
WHERE c.organization_id IS NULL AND m.user_id = c.user_id;

UPDATE public.instagram_comment_automations c
SET organization_id = m.organization_id
FROM public.organization_members m
WHERE c.organization_id IS NULL AND m.user_id = c.user_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_whatsapp_configs_org        ON public.whatsapp_configs(organization_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_org       ON public.whatsapp_messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_org      ON public.instagram_accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_instagram_conversations_org ON public.instagram_conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_org      ON public.instagram_messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_instagram_comments_org      ON public.instagram_comments(organization_id);
CREATE INDEX IF NOT EXISTS idx_instagram_automations_org   ON public.instagram_comment_automations(organization_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Wire the auto-populate trigger (function exists from 20260518110000)
--    The trigger fills organization_id on INSERT by:
--      a) auth_user_org_id()  — works for frontend/authenticated inserts
--      b) user_id column lookup — works for service-role webhook inserts
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_organization_id_trigger ON public.whatsapp_configs;
CREATE TRIGGER set_organization_id_trigger
  BEFORE INSERT ON public.whatsapp_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id_on_insert('user_id');

DROP TRIGGER IF EXISTS set_organization_id_trigger ON public.whatsapp_messages;
CREATE TRIGGER set_organization_id_trigger
  BEFORE INSERT ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id_on_insert('user_id');

DROP TRIGGER IF EXISTS set_organization_id_trigger ON public.instagram_accounts;
CREATE TRIGGER set_organization_id_trigger
  BEFORE INSERT ON public.instagram_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id_on_insert('user_id');

DROP TRIGGER IF EXISTS set_organization_id_trigger ON public.instagram_conversations;
CREATE TRIGGER set_organization_id_trigger
  BEFORE INSERT ON public.instagram_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id_on_insert('user_id');

DROP TRIGGER IF EXISTS set_organization_id_trigger ON public.instagram_messages;
CREATE TRIGGER set_organization_id_trigger
  BEFORE INSERT ON public.instagram_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id_on_insert('user_id');

DROP TRIGGER IF EXISTS set_organization_id_trigger ON public.instagram_comments;
CREATE TRIGGER set_organization_id_trigger
  BEFORE INSERT ON public.instagram_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id_on_insert('user_id');

DROP TRIGGER IF EXISTS set_organization_id_trigger ON public.instagram_comment_automations;
CREATE TRIGGER set_organization_id_trigger
  BEFORE INSERT ON public.instagram_comment_automations
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id_on_insert('user_id');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Drop ALL existing user-scoped policies on these tables
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  tbl TEXT;
  pol RECORD;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'whatsapp_configs', 'whatsapp_messages',
    'instagram_accounts', 'instagram_conversations', 'instagram_messages',
    'instagram_comments', 'instagram_comment_automations'
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
-- 6. Create org-scoped policies
-- ─────────────────────────────────────────────────────────────────────────────

-- ── whatsapp_configs ─────────────────────────────────────────────────────────
-- All org members can READ (to know WA is configured, fetch number for display)
-- Only the config owner (admin) can INSERT / UPDATE / DELETE
CREATE POLICY "whatsapp_configs_org_select" ON public.whatsapp_configs
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "whatsapp_configs_org_insert" ON public.whatsapp_configs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_org_member(organization_id));

CREATE POLICY "whatsapp_configs_org_update" ON public.whatsapp_configs
  FOR UPDATE TO authenticated
  USING  (auth.uid() = user_id AND public.is_org_member(organization_id))
  WITH CHECK (auth.uid() = user_id AND public.is_org_member(organization_id));

CREATE POLICY "whatsapp_configs_org_delete" ON public.whatsapp_configs
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND public.is_org_member(organization_id));

-- ── whatsapp_messages ────────────────────────────────────────────────────────
-- All org members can SELECT, INSERT (send), and UPDATE (mark read/delivered)
CREATE POLICY "whatsapp_messages_org_select" ON public.whatsapp_messages
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "whatsapp_messages_org_insert" ON public.whatsapp_messages
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "whatsapp_messages_org_update" ON public.whatsapp_messages
  FOR UPDATE TO authenticated
  USING  (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ── instagram_accounts ───────────────────────────────────────────────────────
-- All org members can see connected IG accounts
-- Only account owner can modify
CREATE POLICY "ig_accounts_org_select" ON public.instagram_accounts
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "ig_accounts_org_insert" ON public.instagram_accounts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_org_member(organization_id));

CREATE POLICY "ig_accounts_org_update" ON public.instagram_accounts
  FOR UPDATE TO authenticated
  USING  (auth.uid() = user_id AND public.is_org_member(organization_id))
  WITH CHECK (auth.uid() = user_id AND public.is_org_member(organization_id));

CREATE POLICY "ig_accounts_org_delete" ON public.instagram_accounts
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND public.is_org_member(organization_id));

-- ── instagram_conversations ──────────────────────────────────────────────────
CREATE POLICY "ig_conversations_org" ON public.instagram_conversations
  FOR ALL TO authenticated
  USING  (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ── instagram_messages ───────────────────────────────────────────────────────
CREATE POLICY "ig_messages_org" ON public.instagram_messages
  FOR ALL TO authenticated
  USING  (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ── instagram_comments ───────────────────────────────────────────────────────
CREATE POLICY "ig_comments_org" ON public.instagram_comments
  FOR ALL TO authenticated
  USING  (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ── instagram_comment_automations ────────────────────────────────────────────
CREATE POLICY "ig_automations_org" ON public.instagram_comment_automations
  FOR ALL TO authenticated
  USING  (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Orphan report
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  tbl TEXT;
  cnt BIGINT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'whatsapp_configs', 'whatsapp_messages',
    'instagram_accounts', 'instagram_conversations', 'instagram_messages'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id IS NULL', tbl) INTO cnt;
    IF cnt > 0 THEN
      RAISE NOTICE '[messaging-org-scope] % rows in %.organization_id are NULL — check user memberships',
        cnt, tbl;
    END IF;
  END LOOP;
END $$;
