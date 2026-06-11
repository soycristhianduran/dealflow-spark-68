const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const META_APP_ID = Deno.env.get("META_APP_ID");
  const META_WA_CONFIG_ID = Deno.env.get("META_WA_CONFIG_ID");
  const META_FB_CONFIG_ID = Deno.env.get("META_FB_CONFIG_ID");
  if (!META_APP_ID) {
    return new Response(JSON.stringify({ error: "META_APP_ID not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    app_id: META_APP_ID,
    wa_config_id: META_WA_CONFIG_ID || null,
    fb_config_id: META_FB_CONFIG_ID || null,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
