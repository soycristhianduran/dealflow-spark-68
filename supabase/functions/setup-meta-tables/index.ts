import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Use rpc to execute DDL via postgres function that does execute
  // We'll do it differently: use the supabase REST API's /rpc/exec_sql if available,
  // or just do an upsert test to see if the table exists.
  // Actually, use direct fetch to supabase SQL endpoint with service role
  const ddl = `
    CREATE TABLE IF NOT EXISTS public.meta_adsets (
      id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      adset_id        TEXT        NOT NULL,
      adset_name      TEXT        NOT NULL,
      campaign_id     TEXT        NOT NULL,
      status          TEXT,
      daily_budget    NUMERIC,
      lifetime_budget NUMERIC,
      spend           NUMERIC     DEFAULT 0,
      impressions     BIGINT      DEFAULT 0,
      clicks          BIGINT      DEFAULT 0,
      leads           INTEGER     DEFAULT 0,
      cpl             NUMERIC,
      ad_account_id   TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id, adset_id)
    );
    ALTER TABLE public.meta_adsets ENABLE ROW LEVEL SECURITY;
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'meta_adsets' AND policyname = 'users manage own adsets'
      ) THEN
        CREATE POLICY "users manage own adsets" ON public.meta_adsets FOR ALL
          USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS public.meta_ads (
      id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      ad_id           TEXT        NOT NULL,
      ad_name         TEXT        NOT NULL,
      adset_id        TEXT        NOT NULL,
      campaign_id     TEXT        NOT NULL,
      status          TEXT,
      creative_id     TEXT,
      headline        TEXT,
      body            TEXT,
      image_url       TEXT,
      call_to_action  TEXT,
      spend           NUMERIC     DEFAULT 0,
      impressions     BIGINT      DEFAULT 0,
      clicks          BIGINT      DEFAULT 0,
      leads           INTEGER     DEFAULT 0,
      cpl             NUMERIC,
      ad_account_id   TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id, ad_id)
    );
    ALTER TABLE public.meta_ads ENABLE ROW LEVEL SECURITY;
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'meta_ads' AND policyname = 'users manage own ads'
      ) THEN
        CREATE POLICY "users manage own ads" ON public.meta_ads FOR ALL
          USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
      END IF;
    END $$;

    ALTER TABLE public.meta_ads ADD COLUMN IF NOT EXISTS video_id TEXT;
    ALTER TABLE public.meta_ads ADD COLUMN IF NOT EXISTS video_url TEXT;
  `;

  // Execute via the Supabase management API (available from within edge functions)
  const pgUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!pgUrl) {
    return new Response(JSON.stringify({ error: "No SUPABASE_DB_URL available" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Use pg directly
  const { Pool } = await import("https://deno.land/x/postgres@v0.19.3/mod.ts");
  const pool = new Pool(pgUrl, 1, true);
  const client = await pool.connect();
  try {
    await client.queryObject(ddl);
    return new Response(JSON.stringify({ success: true, message: "Tables created" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    client.release();
    await pool.end();
  }
});
