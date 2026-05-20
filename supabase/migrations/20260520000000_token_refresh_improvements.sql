-- ============================================================================
-- Token refresh: extend coverage to IG, add status tracking, schedule daily cron
-- ============================================================================
-- Two bugs this migration unblocks:
--
--   1. Page tokens stored in `facebook_pages.page_access_token` and
--      `instagram_accounts.page_access_token` were never refreshed. They
--      live as long as the underlying user token, so when the user token
--      expires (60 days) and is refreshed, the OLD page tokens silently
--      remain in the DB even though they're now stale. Result: messages
--      and comments stop arriving without any visible error.
--
--   2. `facebook-refresh-tokens` Edge Function existed but was NEVER
--      scheduled (no pg_cron entry). Every customer's tokens died
--      silently at the 60-day mark.
--
-- Plus we add a `needs_reconnect` flag so the UI can surface tokens that
-- failed to refresh (e.g. user revoked permissions on the Meta side).
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tracking columns on facebook_tokens
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.facebook_tokens
  ADD COLUMN IF NOT EXISTS needs_reconnect      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_refresh_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_refresh_error   TEXT;

COMMENT ON COLUMN public.facebook_tokens.needs_reconnect IS
  'Set to TRUE by the refresh job when Meta returns OAuthException (e.g. user revoked permissions). UI should show a "Reconnect" banner when true.';

COMMENT ON COLUMN public.facebook_tokens.last_refresh_at IS
  'Timestamp of the last successful refresh. NULL if never refreshed since this row was created.';

COMMENT ON COLUMN public.facebook_tokens.last_refresh_error IS
  'Last error message from Meta on a failed refresh attempt. NULL on success.';

-- Index for the refresh job's WHERE clause
CREATE INDEX IF NOT EXISTS idx_facebook_tokens_refresh_due
  ON public.facebook_tokens(token_expires_at)
  WHERE needs_reconnect = FALSE;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Same tracking columns on instagram_accounts
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.instagram_accounts
  ADD COLUMN IF NOT EXISTS needs_reconnect      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_refresh_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_refresh_error   TEXT;

COMMENT ON COLUMN public.instagram_accounts.needs_reconnect IS
  'Set to TRUE when the page token associated with this IG account fails to refresh. UI should show a "Reconnect Instagram" banner when true.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Schedule the refresh cron
-- ─────────────────────────────────────────────────────────────────────────────
-- Uses pg_cron + the pg_net HTTP client to invoke our Edge Function once a
-- day. The service_role_key is read from Supabase Vault so we don't
-- hardcode it in the cron.job table (which is auditable but readable by
-- anyone with DB access).
--
-- Prerequisites the operator must run ONCE in the Supabase Dashboard SQL
-- editor (cannot be embedded here because it requires the actual secret):
--
--   -- one-time setup, replace the value with the real key
--   SELECT vault.create_secret(
--     '<SUPABASE_SERVICE_ROLE_KEY>',
--     'service_role_key'
--   );
--
-- If the secret doesn't exist yet, this migration still installs the cron
-- definition. The job will fail at execution time until the secret is
-- created — but that's a recoverable, observable failure.

DO $$
DECLARE
  v_supabase_url TEXT := 'https://oqwcgvemrvimrdrzjzil.supabase.co';
BEGIN
  -- Only proceed if pg_cron is installed (it should be by default on Supabase)
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — refresh job NOT scheduled. Enable pg_cron via Supabase Dashboard → Database → Extensions, then re-run this migration block.';
    RETURN;
  END IF;

  -- Unschedule any previous version so this migration is idempotent
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'refresh-facebook-tokens-daily';

  -- Schedule the new job
  PERFORM cron.schedule(
    'refresh-facebook-tokens-daily',
    '0 3 * * *',  -- daily at 03:00 UTC (22:00 Colombia, low traffic)
    format($job$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'service_role_key'
            LIMIT 1
          ),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      ) AS request_id;
    $job$, v_supabase_url || '/functions/v1/facebook-refresh-tokens')
  );

  RAISE NOTICE '✓ Daily token refresh cron scheduled. Make sure the service_role_key secret exists in Vault (see migration header).';
END $$;
