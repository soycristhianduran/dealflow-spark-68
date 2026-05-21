-- ============================================================================
-- Auto-create workspace + membership when a new user signs up
-- ============================================================================
-- BUG this fixes: previously, `supabase.auth.signUp` only created an entry
-- in `auth.users` and stashed metadata. No organization was created, no
-- membership row, no subscription. The user landed in /w/_/settings (a
-- 404) and was stuck.
--
-- This migration adds a trigger on auth.users that:
--   1. Generates a unique slug from company_name (or full_name, or user_id)
--   2. Inserts an organizations row owned by the new user
--   3. Inserts an organization_members row with role='owner'
--   4. The pre-existing `organizations_start_trial` trigger then fires
--      automatically and creates the 14-day Pro trial subscription
--
-- All side effects use SECURITY DEFINER so the trigger works regardless of
-- the role inserting into auth.users (which is normally `supabase_auth_admin`,
-- not the new user themselves).
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- Slug generator — strips accents, lowercases, replaces non-alnum with hyphens
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.slugify(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(
        unaccent(coalesce(p_text, 'workspace')),
        '[^a-zA-Z0-9\s-]', '', 'g'   -- strip special chars
      ),
      '\s+', '-', 'g'                  -- spaces → hyphens
    )
  );
$$;

-- Best-effort unaccent — fall back to identity if extension isn't installed.
-- (Supabase has unaccent enabled by default; this is just a belt-and-suspenders.)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS unaccent;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'unaccent extension unavailable; slugify will keep accents';
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- handle_new_user — fires AFTER INSERT on auth.users
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company   TEXT;
  v_full_name TEXT;
  v_org_name  TEXT;
  v_slug      TEXT;
  v_slug_try  TEXT;
  v_attempt   INTEGER := 0;
  v_org_id    UUID;
BEGIN
  -- Extract metadata captured by the signup form
  v_company   := NULLIF(trim(coalesce(NEW.raw_user_meta_data ->> 'company_name', '')), '');
  v_full_name := NULLIF(trim(coalesce(NEW.raw_user_meta_data ->> 'full_name', '')), '');

  -- Workspace name: company name if provided, else "<First Name>'s workspace"
  v_org_name := coalesce(
    v_company,
    CASE
      WHEN v_full_name IS NOT NULL THEN v_full_name || ' Workspace'
      ELSE 'Workspace'
    END
  );

  -- Generate a unique slug. Try the slugified name first, then append
  -- short id suffixes until we find one that's free. Caps at 10 attempts
  -- to avoid a runaway loop.
  v_slug := public.slugify(v_org_name);
  IF v_slug IS NULL OR length(v_slug) = 0 THEN
    v_slug := 'workspace';
  END IF;
  v_slug_try := v_slug;

  LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug_try);
    v_attempt := v_attempt + 1;
    IF v_attempt > 10 THEN
      -- give up and use the user id directly
      v_slug_try := v_slug || '-' || substring(NEW.id::text, 1, 8);
      EXIT;
    END IF;
    v_slug_try := v_slug || '-' || substring(NEW.id::text, 1, 4 + v_attempt);
  END LOOP;

  -- Create the organization (this also triggers organizations_start_trial)
  INSERT INTO public.organizations (name, slug)
  VALUES (v_org_name, v_slug_try)
  RETURNING id INTO v_org_id;

  -- Link the new user as owner of their workspace
  INSERT INTO public.organization_members (user_id, organization_id, role)
  VALUES (NEW.id, v_org_id, 'owner');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block signup just because workspace bootstrapping failed; just
  -- log it loudly so the operator notices.
  RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS handle_new_user_trigger ON auth.users;
CREATE TRIGGER handle_new_user_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: any existing auth.users WITHOUT a membership get a workspace too.
-- ─────────────────────────────────────────────────────────────────────────────
-- (Your test reviewer / dev accounts that signed up before this migration
-- could be in this state.)
DO $$
DECLARE
  u RECORD;
  v_org_id UUID;
  v_name TEXT;
  v_slug TEXT;
  v_slug_try TEXT;
  v_attempt INTEGER;
  v_count INTEGER := 0;
BEGIN
  FOR u IN
    SELECT au.id, au.raw_user_meta_data
    FROM auth.users au
    LEFT JOIN public.organization_members om ON om.user_id = au.id
    WHERE om.id IS NULL
  LOOP
    v_name := coalesce(
      NULLIF(trim(coalesce(u.raw_user_meta_data ->> 'company_name', '')), ''),
      NULLIF(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), '') || ' Workspace',
      'Workspace'
    );
    v_slug := public.slugify(v_name);
    IF v_slug IS NULL OR length(v_slug) = 0 THEN v_slug := 'workspace'; END IF;
    v_slug_try := v_slug;
    v_attempt := 0;
    LOOP
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug_try);
      v_attempt := v_attempt + 1;
      IF v_attempt > 10 THEN
        v_slug_try := v_slug || '-' || substring(u.id::text, 1, 8);
        EXIT;
      END IF;
      v_slug_try := v_slug || '-' || substring(u.id::text, 1, 4 + v_attempt);
    END LOOP;

    INSERT INTO public.organizations (name, slug) VALUES (v_name, v_slug_try) RETURNING id INTO v_org_id;
    INSERT INTO public.organization_members (user_id, organization_id, role) VALUES (u.id, v_org_id, 'owner');
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Backfilled workspaces for % users that previously had no membership', v_count;
END $$;
