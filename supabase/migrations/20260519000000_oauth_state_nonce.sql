-- ============================================================================
-- OAuth state nonce — CSRF protection for Meta/WhatsApp OAuth flows
-- ============================================================================
-- Before this migration, the OAuth `state` parameter was the raw user_id UUID:
--
--   const state = user.id;   // src/hooks/useFacebookIntegration.ts
--
-- This is the textbook CSRF vector: an attacker who knows the victim's
-- user_id (UUIDs leak through screenshots, member lists, public profiles)
-- can initiate the OAuth flow from their OWN browser using the victim's
-- user_id as state. Meta redirects to our callback with the attacker's
-- `code` and the victim's `state` → the callback exchanges the code and
-- stores the attacker's access_token under the victim's user_id. The
-- attacker now reads the victim's DMs / leads through the victim's CRM.
--
-- This migration replaces the raw user_id with a cryptographically random,
-- single-use, time-limited nonce that is:
--   1. Created by the frontend before each OAuth redirect, via RPC
--      (SECURITY DEFINER — bound to auth.uid() server-side, not client-side)
--   2. Consumed by the OAuth callback Edge Function before token exchange
--   3. Self-expiring after 15 minutes
--   4. Single-use (used_at column prevents replay)
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Storage
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.oauth_state_tokens (
  -- The random nonce, URL-safe base64 (~43 chars from 32 bytes). Primary key
  -- so duplicates are impossible.
  token TEXT PRIMARY KEY,

  -- Which CRM user initiated the OAuth flow. Bound at create time from
  -- auth.uid() so the client can't claim someone else's identity.
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 'facebook' (covers FB + IG, same OAuth provider) or 'whatsapp'. Stored so
  -- we can refuse a state issued for one provider being used on another's
  -- callback (defense in depth).
  provider TEXT NOT NULL CHECK (provider IN ('facebook', 'whatsapp')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- NULL until the callback consumes the token. Single-use guarantee.
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_oauth_state_tokens_user_id_created_at
  ON public.oauth_state_tokens(user_id, created_at DESC);

-- Auto-cleanup index (for the periodic delete job)
CREATE INDEX IF NOT EXISTS idx_oauth_state_tokens_created_at
  ON public.oauth_state_tokens(created_at);

ALTER TABLE public.oauth_state_tokens ENABLE ROW LEVEL SECURITY;
-- No policies — all access goes through the SECURITY DEFINER RPCs below.
-- (service_role inside Edge Functions bypasses RLS for the cleanup job.)


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. create_oauth_state(provider) → token
-- ─────────────────────────────────────────────────────────────────────────────
-- Called by the frontend (authenticated user only) right before redirecting
-- the browser to Meta's /dialog/oauth endpoint. Returns the random token
-- that should be used as the `state` query param.

CREATE OR REPLACE FUNCTION public.create_oauth_state(p_provider TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_token   TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_provider IS NULL OR p_provider NOT IN ('facebook', 'whatsapp') THEN
    RAISE EXCEPTION 'Invalid provider: %', p_provider USING ERRCODE = '22023';
  END IF;

  -- 32 bytes → 43 chars base64url (no padding). Crypto-random via pgcrypto's
  -- gen_random_bytes(), available by default on Supabase.
  v_token := translate(
    encode(gen_random_bytes(32), 'base64'),
    '+/=',
    '-_'
  );

  INSERT INTO public.oauth_state_tokens (token, user_id, provider)
  VALUES (v_token, v_user_id, p_provider);

  RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_oauth_state(TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. consume_oauth_state(token, provider) → user_id (or NULL)
-- ─────────────────────────────────────────────────────────────────────────────
-- Called by the OAuth callback Edge Function (service_role) to validate the
-- state parameter Meta echoed back. Returns the user_id that originally
-- created the token IF the token is:
--   - present in the table
--   - issued for the same provider
--   - not yet consumed
--   - less than 15 minutes old
-- Otherwise returns NULL (callback should redirect with a generic error).
--
-- Marks the token used in the same transaction so a replay is rejected.

CREATE OR REPLACE FUNCTION public.consume_oauth_state(
  p_token    TEXT,
  p_provider TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 OR length(p_token) > 128 THEN
    RETURN NULL;
  END IF;

  -- Row-level lock so two concurrent callbacks can't both consume it.
  SELECT user_id, used_at, created_at, provider
    INTO v_row
  FROM public.oauth_state_tokens
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_row.used_at IS NOT NULL THEN
    -- Replay attempt — token was already consumed
    RETURN NULL;
  END IF;
  IF v_row.provider <> p_provider THEN
    -- Provider mismatch — state was issued for a different OAuth flow
    RETURN NULL;
  END IF;
  IF v_row.created_at < NOW() - INTERVAL '15 minutes' THEN
    -- Expired — Meta took too long, user idled, or it's an attack with
    -- a stale token they grabbed somewhere
    RETURN NULL;
  END IF;

  UPDATE public.oauth_state_tokens
    SET used_at = NOW()
    WHERE token = p_token;

  RETURN v_row.user_id;
END;
$$;

-- service_role bypasses RLS but still calls this function explicitly.
-- We grant to authenticated too in case a future frontend flow needs it.
GRANT EXECUTE ON FUNCTION public.consume_oauth_state(TEXT, TEXT) TO service_role, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Cleanup helper
-- ─────────────────────────────────────────────────────────────────────────────
-- Removes consumed-or-expired tokens older than 1 hour. Call from a daily
-- cron (pg_cron or Vercel cron). Keeps the table small without losing the
-- replay-detection window.

CREATE OR REPLACE FUNCTION public.cleanup_oauth_state_tokens()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH deleted AS (
    DELETE FROM public.oauth_state_tokens
    WHERE created_at < NOW() - INTERVAL '1 hour'
    RETURNING 1
  )
  SELECT count(*)::INTEGER FROM deleted;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Documentation
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.oauth_state_tokens IS
  'CSRF nonce store for OAuth state parameters. Each token is single-use and expires after 15 minutes.';

COMMENT ON FUNCTION public.create_oauth_state(TEXT) IS
  'Issues a single-use OAuth state nonce for the authenticated user. Called from frontend before redirecting to Meta /dialog/oauth.';

COMMENT ON FUNCTION public.consume_oauth_state(TEXT, TEXT) IS
  'Validates and consumes an OAuth state nonce. Returns the issuing user_id if valid (issued for same provider, not yet used, <15min old), else NULL.';
