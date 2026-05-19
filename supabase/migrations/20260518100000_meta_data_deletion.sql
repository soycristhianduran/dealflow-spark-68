-- Meta Data Deletion Callback infrastructure
-- Required by Meta for App Review: when a user revokes our app from their
-- Facebook/Instagram account, Meta POSTs to a registered callback URL with
-- a signed_request payload. We must (a) acknowledge with a confirmation code
-- and a status URL, and (b) delete the user's data within a reasonable period.
--
-- See: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback

-- ============================================================================
-- 1) Capture the Meta App-Scoped User ID (ASID) when users connect
-- ============================================================================
-- Meta's signed_request only contains the ASID — NOT our auth.users.id. We
-- need to store this ASID at OAuth time so the deletion callback can look up
-- which internal user(s) to scrub.
--
-- Nullable to preserve existing rows (legacy connections won't have an ASID
-- and their data won't be auto-deleted on Meta-side revocation — that's an
-- acceptable backfill gap; users can still trigger deletion manually).

ALTER TABLE public.facebook_tokens
  ADD COLUMN IF NOT EXISTS fb_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_facebook_tokens_fb_user_id
  ON public.facebook_tokens(fb_user_id)
  WHERE fb_user_id IS NOT NULL;

ALTER TABLE public.instagram_accounts
  ADD COLUMN IF NOT EXISTS fb_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_instagram_accounts_fb_user_id
  ON public.instagram_accounts(fb_user_id)
  WHERE fb_user_id IS NOT NULL;

-- ============================================================================
-- 2) Audit log of every deletion request Meta sends us
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.data_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Returned to Meta in the synchronous callback response and shown to the
  -- end user on the public status page. URL-safe random string.
  confirmation_code TEXT NOT NULL UNIQUE,

  -- ASID parsed from signed_request payload
  meta_user_id TEXT NOT NULL,

  -- Which Meta app sent the deletion (helpful when multiple apps share infra)
  meta_app_id TEXT,

  -- pending  → queued, deletion in flight
  -- completed → all matching data removed (or no data found, which we treat as success)
  -- failed   → deletion threw an unrecoverable error; needs human review
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed')),

  -- Which internal auth.users.id(s) were affected. Stored even after the user
  -- row is removed via cascade so we keep an audit trail for the legal team.
  affected_user_ids UUID[] DEFAULT '{}',

  -- Free-form error / log payload when status = 'failed'
  error_detail TEXT,

  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Raw signed_request stored ONLY long enough to debug verification issues;
  -- the cron below scrubs it after 30 days.
  raw_signed_request TEXT
);

CREATE INDEX IF NOT EXISTS idx_data_deletion_requests_meta_user_id
  ON public.data_deletion_requests(meta_user_id);

CREATE INDEX IF NOT EXISTS idx_data_deletion_requests_status
  ON public.data_deletion_requests(status)
  WHERE status = 'pending';

ALTER TABLE public.data_deletion_requests ENABLE ROW LEVEL SECURITY;

-- No direct client access. The status page reads via the SECURITY DEFINER
-- function below; the callback writes via service_role (RLS-bypassing).
-- This keeps the meta_user_id, raw payload, and affected_user_ids private.

-- ============================================================================
-- 3) Public status lookup — single-row by confirmation_code
-- ============================================================================
-- The confirmation_code is a long random string; given it, the requester is
-- entitled to know whether their deletion has been processed. We expose ONLY
-- status + timestamps — never the ASID or affected user list.
CREATE OR REPLACE FUNCTION public.get_data_deletion_status(p_code TEXT)
RETURNS TABLE (
  status TEXT,
  requested_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT status, requested_at, completed_at
  FROM public.data_deletion_requests
  WHERE confirmation_code = p_code
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_data_deletion_status(TEXT) TO anon, authenticated;

-- ============================================================================
-- 4) Scrub raw_signed_request after 30 days (debug-only retention)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.scrub_old_signed_requests()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.data_deletion_requests
  SET raw_signed_request = NULL
  WHERE raw_signed_request IS NOT NULL
    AND requested_at < NOW() - INTERVAL '30 days';
$$;

-- Scheduling (pg_cron / Vercel cron) is left to the deploy pipeline; calling
-- the function ad-hoc from a daily job is sufficient.

COMMENT ON TABLE public.data_deletion_requests IS
  'Audit log of Meta data-deletion-callback requests. Required for Meta App Review compliance.';

COMMENT ON COLUMN public.data_deletion_requests.confirmation_code IS
  'URL-safe random string returned to Meta and shown to the end user on the status page.';

COMMENT ON COLUMN public.facebook_tokens.fb_user_id IS
  'Meta App-Scoped User ID (ASID), captured at OAuth time so we can fulfill data deletion callbacks.';

COMMENT ON COLUMN public.instagram_accounts.fb_user_id IS
  'Meta App-Scoped User ID (ASID) of the Facebook user who connected this IG account.';
