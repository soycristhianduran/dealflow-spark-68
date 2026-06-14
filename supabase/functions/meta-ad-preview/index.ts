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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    // Security gate: only allow previewing ads that actually generated leads for
    // an org this user belongs to (so they can't probe arbitrary ad ids).
    const { data: memberships } = await supabase
      .from("organization_members").select("organization_id").eq("user_id", user.id);
    const orgIds = (memberships || []).map((m: any) => m.organization_id);
    if (orgIds.length) {
      const { data: owns } = await supabase.from("contacts").select("id")
        .in("organization_id", orgIds).eq("meta_ad_id", String(ad_id)).limit(1).maybeSingle();
      if (!owns) return json({ error: "not_authorized", message: "Este anuncio no está vinculado a tus leads." });
    }

    // The owning Facebook token can live under a different org of the same owner,
    // so try every active token (the ad was already verified as the user's above).
    const { data: allTokens } = await supabase
      .from("facebook_tokens").select("access_token").not("access_token", "is", null);
    const seen = new Set<string>();
    const tokens = (allTokens || []).filter((t: any) => t.access_token && !seen.has(t.access_token) && seen.add(t.access_token));

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
