-- ============================================================================
-- Email logging + DB → Edge Function dispatcher
-- ============================================================================
-- Two pieces:
--   1. email_log table — audit trail of every transactional email we send.
--      Powers idempotency (dedupe_key) and supports debugging.
--   2. dispatch_transactional_email() RPC — invokes the Edge Function via
--      pg_net so DB triggers can send emails without going through the app.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. email_log
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  template          TEXT NOT NULL,
  recipient         TEXT NOT NULL,
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id   UUID REFERENCES public.organizations(id) ON DELETE SET NULL,

  -- Idempotency key — if a row with this value exists, the send is skipped.
  -- Convention: '<template>:<user_id>:<period>' (e.g.
  -- 'trial_ending:abc123:2026-06-03'). NULL means "always send, no dedupe".
  dedupe_key        TEXT UNIQUE,

  status            TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'queued')),
  resend_message_id TEXT,
  error_detail      TEXT,

  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_log_user
  ON public.email_log(user_id, sent_at DESC) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_log_organization
  ON public.email_log(organization_id, sent_at DESC) WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_log_template_sent
  ON public.email_log(template, sent_at DESC);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
-- No client policies — log is only readable/writable by service_role.

COMMENT ON TABLE public.email_log IS
  'Audit + idempotency log for transactional emails sent via send-transactional-email Edge Function.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. dispatch_transactional_email() — called from triggers / crons
-- ─────────────────────────────────────────────────────────────────────────────
-- Wraps pg_net.http_post so we have one consistent place to invoke the Edge
-- Function. The Edge Function URL + service_role auth come from Vault
-- (configured during migration 20260520000000) — keeps secrets out of code.

CREATE OR REPLACE FUNCTION public.dispatch_transactional_email(
  p_to              TEXT,
  p_template        TEXT,
  p_data            JSONB,
  p_dedupe_key      TEXT DEFAULT NULL,
  p_user_id         UUID DEFAULT NULL,
  p_organization_id UUID DEFAULT NULL
)
RETURNS BIGINT  -- net.http_post returns a request_id you can use to inspect later
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url    TEXT := 'https://oqwcgvemrvimrdrzjzil.supabase.co/functions/v1/send-transactional-email';
  v_key    TEXT;
  v_req_id BIGINT;
BEGIN
  -- Reuse the same service_role_key vault entry the refresh cron uses
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF v_key IS NULL THEN
    RAISE WARNING 'service_role_key not found in Vault; email NOT dispatched (template=%, to=%)', p_template, p_to;
    RETURN NULL;
  END IF;

  v_req_id := net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type',  'application/json'
    ),
    body := jsonb_build_object(
      'to',              p_to,
      'template',        p_template,
      'data',            p_data,
      'dedupe_key',      p_dedupe_key,
      'user_id',         p_user_id,
      'organization_id', p_organization_id
    )
  );

  RETURN v_req_id;
EXCEPTION WHEN OTHERS THEN
  -- Never let an email failure break the triggering operation
  RAISE WARNING 'dispatch_transactional_email failed (template=%, to=%): %', p_template, p_to, SQLERRM;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.dispatch_transactional_email IS
  'Async-fires the send-transactional-email Edge Function via pg_net. Safe to call from triggers — errors are logged as warnings, never propagated.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Hook into handle_new_user to send the welcome email
-- ─────────────────────────────────────────────────────────────────────────────
-- We modify the existing handle_new_user to also fire the welcome email
-- after the org + membership are created. Re-creating the whole function
-- here to keep the canonical version in one place.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company   TEXT;
  v_full_name TEXT;
  v_first_name TEXT;
  v_org_name  TEXT;
  v_slug      TEXT;
  v_slug_try  TEXT;
  v_attempt   INTEGER := 0;
  v_org_id    UUID;
BEGIN
  v_company    := NULLIF(trim(coalesce(NEW.raw_user_meta_data ->> 'company_name', '')), '');
  v_full_name  := NULLIF(trim(coalesce(NEW.raw_user_meta_data ->> 'full_name', '')), '');
  v_first_name := NULLIF(trim(coalesce(NEW.raw_user_meta_data ->> 'first_name', '')), '');

  v_org_name := coalesce(
    v_company,
    CASE WHEN v_full_name IS NOT NULL THEN v_full_name || ' Workspace' ELSE 'Workspace' END
  );

  v_slug := public.slugify(v_org_name);
  IF v_slug IS NULL OR length(v_slug) = 0 THEN v_slug := 'workspace'; END IF;
  v_slug_try := v_slug;

  LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug_try);
    v_attempt := v_attempt + 1;
    IF v_attempt > 10 THEN
      v_slug_try := v_slug || '-' || substring(NEW.id::text, 1, 8);
      EXIT;
    END IF;
    v_slug_try := v_slug || '-' || substring(NEW.id::text, 1, 4 + v_attempt);
  END LOOP;

  INSERT INTO public.organizations (name, slug)
  VALUES (v_org_name, v_slug_try)
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_members (user_id, organization_id, role)
  VALUES (NEW.id, v_org_id, 'owner');

  -- Welcome email (fire-and-forget — errors don't block signup)
  IF NEW.email IS NOT NULL THEN
    PERFORM public.dispatch_transactional_email(
      p_to              := NEW.email,
      p_template        := 'welcome',
      p_data            := jsonb_build_object(
        'first_name',      coalesce(v_first_name, split_part(v_full_name, ' ', 1), split_part(NEW.email, '@', 1)),
        'workspace_name',  v_org_name,
        'days_in_trial',   14,
        'dashboard_url',   'https://app.aceleradoradeventas.co/w/' || v_slug_try
      ),
      p_dedupe_key      := 'welcome:' || NEW.id::text,
      p_user_id         := NEW.id,
      p_organization_id := v_org_id
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
