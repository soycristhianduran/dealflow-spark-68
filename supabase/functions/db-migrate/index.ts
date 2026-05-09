import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const authHeader = req.headers.get("authorization") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!authHeader.includes(serviceKey.slice(-20))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  const sql = await req.text();
  const statements = sql.split(";").map(s => s.trim()).filter(Boolean);
  const results: any[] = [];
  
  for (const stmt of statements) {
    try {
      const { error } = await supabase.rpc("exec_ddl", { ddl: stmt });
      results.push({ stmt: stmt.substring(0, 60), ok: !error, error: error?.message });
    } catch(e: any) {
      results.push({ stmt: stmt.substring(0, 60), ok: false, error: e.message });
    }
  }
  
  return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
});
