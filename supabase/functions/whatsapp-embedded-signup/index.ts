import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const META_APP_ID = Deno.env.get("META_APP_ID")!;
    const META_APP_SECRET = Deno.env.get("META_APP_SECRET")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authenticate user
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    // Embedded Signup gives us the code (FB.login response) plus the WABA + phone
    // number ids directly from the WA_EMBEDDED_SIGNUP "message" event. We use those
    // ids directly — NEVER iterate me/businesses, which fails for customers whose
    // WABA lives in their own (external) business.
    const code: string | undefined = body?.code;
    const sessionWabaId: string | null = body?.waba_id ?? null;
    const sessionPhoneId: string | null = body?.phone_number_id ?? null;
    const organizationId: string | null = body?.organization_id ?? null;

    if (!code) throw new Error("Missing code from Embedded Signup");

    // 1. Exchange the Embedded Signup code for a business-integration token.
    //    For Embedded Signup, NO redirect_uri is used and the returned token is
    //    already a long-lived (60d) business token — do not run fb_exchange_token.
    const tokenRes = await fetch(
      `${GRAPH_API}/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&code=${encodeURIComponent(code)}`
    );
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error("ES token exchange failed:", JSON.stringify(tokenData));
      throw new Error("No se pudo completar la conexión con Meta (token).");
    }
    const accessToken: string = tokenData.access_token;

    // 2. Resolve WABA + phone ids. Prefer the session ids from the popup; fall
    //    back to debug_token (granular scopes) if the popup didn't surface them.
    let wabaId = sessionWabaId;
    let phoneId = sessionPhoneId;

    if (!wabaId) {
      const dbg = await fetch(
        `${GRAPH_API}/debug_token?input_token=${accessToken}&access_token=${accessToken}`
      ).then((r) => r.json()).catch(() => null);
      const scopes = dbg?.data?.granular_scopes || [];
      const waScope = scopes.find((s: any) => s.scope === "whatsapp_business_management")
                   || scopes.find((s: any) => s.scope === "whatsapp_business_messaging");
      wabaId = waScope?.target_ids?.[0] ?? null;
    }

    if (!wabaId) {
      // Couldn't determine WABA — save token as pending for manual selection.
      await supabase.from("whatsapp_configs").insert({
        user_id: user.id,
        organization_id: organizationId,
        access_token: accessToken,
        phone_number_id: "pending",
        waba_id: "pending",
        is_active: false,
        webhook_verified: false,
      });
      return new Response(JSON.stringify({
        success: true, status: "pending",
        message: "Token guardado. Selecciona tu cuenta y número manualmente.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3. If no phone id from the session, fetch the first phone of the WABA.
    let displayPhone = "";
    let businessName = "";
    {
      const phoneRes = await fetch(
        `${GRAPH_API}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${accessToken}`
      ).then((r) => r.json()).catch(() => null);
      const phones = phoneRes?.data || [];
      const match = phoneId ? phones.find((p: any) => p.id === phoneId) : phones[0];
      const chosen = match || phones[0];
      if (chosen) {
        phoneId = chosen.id;
        displayPhone = chosen.display_phone_number || "";
        businessName = chosen.verified_name || "";
      }
    }

    // 4. CRITICAL: subscribe OUR app to the customer's WABA so Meta delivers
    //    webhooks (incoming messages + delivery statuses) to us. Uses the
    //    customer's own token — the only token with permission over their WABA.
    let webhookSubscribed = false;
    try {
      const subRes = await fetch(`${GRAPH_API}/${wabaId}/subscribed_apps`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}` },
      });
      const subData = await subRes.json();
      console.log("ES WABA subscription:", JSON.stringify(subData));
      webhookSubscribed = subData.success === true;
    } catch (subErr) {
      console.warn("ES WABA subscription failed (non-fatal):", subErr);
    }

    // 5. Persist config. One row per (organization, phone_number_id). We avoid
    //    onConflict:user_id (that overwrote configs and broke multi-number).
    if (phoneId) {
      // Deactivate any stale row for this same phone in this org, then upsert.
      let deQ = supabase.from("whatsapp_configs").update({ is_active: false })
        .eq("phone_number_id", phoneId);
      deQ = organizationId ? deQ.eq("organization_id", organizationId) : deQ.eq("user_id", user.id);
      await deQ;

      await supabase.from("whatsapp_configs").insert({
        user_id: user.id,
        organization_id: organizationId,
        access_token: accessToken,
        phone_number_id: phoneId,
        waba_id: wabaId,
        display_phone: displayPhone,
        business_name: businessName,
        is_active: true,
        webhook_verified: webhookSubscribed,
      });
    } else {
      await supabase.from("whatsapp_configs").insert({
        user_id: user.id,
        organization_id: organizationId,
        access_token: accessToken,
        phone_number_id: "pending",
        waba_id: wabaId,
        is_active: false,
        webhook_verified: false,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      status: phoneId ? "connected" : "pending",
      waba_id: wabaId,
      phone_number_id: phoneId,
      display_phone: displayPhone,
      business_name: businessName,
      webhook_subscribed: webhookSubscribed,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("WhatsApp Embedded Signup error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
