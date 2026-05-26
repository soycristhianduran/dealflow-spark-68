// One-time setup: creates the oauth_state_tokens table and RPCs needed for
// CSRF-safe Facebook/WhatsApp OAuth flows.
// Call once with: curl -X POST <url> -H "x-migration-key: migrate2026"
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

Deno.serve(async (req) => {
  const key = req.headers.get("x-migration-key");
  if (key !== "migrate2026") return new Response("Forbidden", { status: 403 });

  const dbUrl = Deno.env.get("SUPABASE_DB_URL")!;
  const sql = postgres(dbUrl, { max: 1 });

  try {
    // 1. Table
    await sql`
      CREATE TABLE IF NOT EXISTS public.oauth_state_tokens (
        token      TEXT PRIMARY KEY,
        user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        provider   TEXT NOT NULL CHECK (provider IN ('facebook','whatsapp')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        used_at    TIMESTAMPTZ
      )`;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_oauth_state_tokens_user_id_created_at
        ON public.oauth_state_tokens(user_id, created_at DESC)`;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_oauth_state_tokens_created_at
        ON public.oauth_state_tokens(created_at)`;

    await sql`ALTER TABLE public.oauth_state_tokens ENABLE ROW LEVEL SECURITY`;

    // 2. create_oauth_state RPC
    await sql`
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
        IF p_provider IS NULL OR p_provider NOT IN ('facebook','whatsapp') THEN
          RAISE EXCEPTION 'Invalid provider: %', p_provider USING ERRCODE = '22023';
        END IF;
        v_token := translate(
          encode(gen_random_bytes(32), 'base64'),
          '+/=', '-_'
        );
        INSERT INTO public.oauth_state_tokens (token, user_id, provider)
        VALUES (v_token, v_user_id, p_provider);
        RETURN v_token;
      END;
      $$`;

    await sql`GRANT EXECUTE ON FUNCTION public.create_oauth_state(TEXT) TO authenticated`;

    // 3. consume_oauth_state RPC
    await sql`
      CREATE OR REPLACE FUNCTION public.consume_oauth_state(p_token TEXT, p_provider TEXT)
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
        SELECT user_id, used_at, created_at, provider
          INTO v_row
        FROM public.oauth_state_tokens
        WHERE token = p_token
        FOR UPDATE;
        IF NOT FOUND THEN RETURN NULL; END IF;
        IF v_row.used_at IS NOT NULL THEN RETURN NULL; END IF;
        IF v_row.provider <> p_provider THEN RETURN NULL; END IF;
        IF v_row.created_at < NOW() - INTERVAL '15 minutes' THEN RETURN NULL; END IF;
        UPDATE public.oauth_state_tokens SET used_at = NOW() WHERE token = p_token;
        RETURN v_row.user_id;
      END;
      $$`;

    await sql`GRANT EXECUTE ON FUNCTION public.consume_oauth_state(TEXT, TEXT) TO service_role, authenticated`;

    // 4. Cleanup helper
    await sql`
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
      $$`;

    await sql.end();
    return new Response(
      JSON.stringify({ ok: true, message: "oauth_state_tokens table and RPCs created" }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    await sql.end();
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
