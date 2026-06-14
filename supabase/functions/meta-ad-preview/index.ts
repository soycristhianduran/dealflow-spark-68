import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * meta-ad-preview — returns the live Meta ad creative preview (iframe HTML) for a
 * given ad_id. The dashboard's ad-performance table calls this when the user
 * clicks an ad, so they see the actual creative without leaving the CRM.
 *
 * Tries every Facebook token the requesting user has (they may own the ad under
 * a different org), since lead ads can live in a different account than the org.
 */
const GRAPH_API = "https://graph.facebook.com/v21.0";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const { data: { user } } = await supabase.auth.getUser(auth);
    if (!user) return json({ error: "unauthorized" }, 401);

    const { ad_id } = await req.json();
    if (!ad_id) return json({ error: "ad_id required" }, 400);

    // All FB tokens this user has (across their orgs)
    const { data: tokens } = await supabase
      .from("facebook_tokens")
      .select("access_token")
      .eq("user_id", user.id);

    const formats = ["MOBILE_FEED_STANDARD", "DESKTOP_FEED_STANDARD", "INSTAGRAM_STANDARD"];
    for (const t of (tokens || [])) {
      for (const fmt of formats) {
        try {
          const res = await fetch(`${GRAPH_API}/${ad_id}/previews?ad_format=${fmt}&access_token=${t.access_token}`);
          const data = await res.json();
          const body = data?.data?.[0]?.body;
          if (res.ok && body) {
            return json({ preview_html: body, format: fmt });
          }
        } catch { /* try next */ }
      }
    }
    return json({ error: "no_preview", message: "No se pudo obtener la vista del anuncio (puede estar archivado o sin permisos)." });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
