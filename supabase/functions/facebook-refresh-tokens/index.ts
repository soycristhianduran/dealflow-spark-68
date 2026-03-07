import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const META_APP_ID = Deno.env.get("META_APP_ID");
    const META_APP_SECRET = Deno.env.get("META_APP_SECRET");

    if (!META_APP_ID || !META_APP_SECRET) {
      return new Response(JSON.stringify({ error: "Meta credentials not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get tokens expiring within 7 days
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: tokens, error: fetchError } = await supabase
      .from("facebook_tokens")
      .select("id, user_id, access_token, token_expires_at")
      .lt("token_expires_at", sevenDaysFromNow);

    if (fetchError) throw fetchError;
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: "No tokens need refresh", refreshed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let refreshed = 0;
    let failed = 0;

    for (const token of tokens) {
      try {
        // Exchange current token for a new long-lived token
        const res = await fetch(
          `${GRAPH_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${token.access_token}`
        );
        const data = await res.json();

        if (data.access_token) {
          const expiresIn = data.expires_in || 5184000; // 60 days default
          const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

          await supabase.from("facebook_tokens").update({
            access_token: data.access_token,
            token_expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          }).eq("id", token.id);

          refreshed++;
          console.log(`Refreshed token for user ${token.user_id}, expires at ${expiresAt}`);
        } else {
          failed++;
          console.error(`Failed to refresh token for user ${token.user_id}:`, data);
        }
      } catch (e) {
        failed++;
        console.error(`Error refreshing token for user ${token.user_id}:`, e);
      }
    }

    return new Response(JSON.stringify({ refreshed, failed, total: tokens.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Token refresh error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
