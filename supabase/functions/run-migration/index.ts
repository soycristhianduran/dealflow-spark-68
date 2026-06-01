import { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

Deno.serve(async (req: Request) => {
  const secret = req.headers.get("x-migration-secret");
  if (secret !== "migrate-voice-2026") {
    return new Response("Unauthorized", { status: 401 });
  }

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) {
    return new Response(JSON.stringify({ error: "No SUPABASE_DB_URL" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  // Accept SQL from request body, or fall back to the original hardcoded migration
  let sql: string;
  try {
    const body = await req.json().catch(() => ({}));
    sql = body.sql || `ALTER TABLE calling_agents ADD COLUMN IF NOT EXISTS voice_provider TEXT NOT NULL DEFAULT 'openai'`;
  } catch {
    sql = `ALTER TABLE calling_agents ADD COLUMN IF NOT EXISTS voice_provider TEXT NOT NULL DEFAULT 'openai'`;
  }

  const pool = new Pool(dbUrl, 1, true);
  try {
    const conn = await pool.connect();
    try {
      await conn.queryObject(sql);
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } finally {
      conn.release();
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  } finally {
    await pool.end();
  }
});
