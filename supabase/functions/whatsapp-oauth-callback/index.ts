import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH_API = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // user_id
    const error = url.searchParams.get("error");
    const errorReason = url.searchParams.get("error_reason");
    const appUrl = Deno.env.get("APP_URL") || "https://dealflow-spark-68.lovable.app";

    console.log("WhatsApp OAuth callback received:", { 
      hasCode: !!code, 
      state, 
      error, 
      errorReason,
      appUrl 
    });

    if (error) {
      const errorMsg = errorReason || error;
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/integrations?wa_error=${encodeURIComponent(errorMsg)}` },
      });
    }

    if (!code || !state) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/integrations?wa_error=${encodeURIComponent("Faltan parámetros (code o state)")}` },
      });
    }

    const META_APP_ID = Deno.env.get("META_APP_ID");
    const META_APP_SECRET = Deno.env.get("META_APP_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!META_APP_ID || !META_APP_SECRET) {
      console.error("META_APP_ID or META_APP_SECRET not configured");
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/integrations?wa_error=${encodeURIComponent("META_APP_ID o META_APP_SECRET no configurados")}` },
      });
    }

    const redirectUri = `${SUPABASE_URL}/functions/v1/whatsapp-oauth-callback`;

    // Step 1: Exchange code for short-lived token
    const tokenUrl = `${GRAPH_API}/oauth/access_token?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${META_APP_SECRET}&code=${code}`;
    console.log("Exchanging code for token...");
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("WA token exchange failed:", JSON.stringify(tokenData));
      const errorDetail = tokenData.error?.message || "No se pudo intercambiar el código por un token";
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/integrations?wa_error=${encodeURIComponent(errorDetail)}` },
      });
    }

    console.log("Short-lived token obtained, exchanging for long-lived...");

    // Step 2: Exchange for long-lived token
    const longTokenRes = await fetch(
      `${GRAPH_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
    );
    const longTokenData = await longTokenRes.json();
    const longLivedToken = longTokenData.access_token || tokenData.access_token;

    console.log("Long-lived token obtained. Saving config for user:", state);

    // Step 3: Store token - try to find WABA and phone automatically
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Try to auto-discover WABA and phone
    let selectedWabaId = "pending";
    let selectedPhoneId = "pending";
    let displayPhone = "";
    let businessName = "";
    let isActive = false;

    try {
      const bizRes = await fetch(`${GRAPH_API}/me/businesses?fields=id,name&access_token=${longLivedToken}`);
      const bizData = await bizRes.json();
      const businesses = bizData.data || [];

      for (const biz of businesses) {
        const wabaRes = await fetch(
          `${GRAPH_API}/${biz.id}/owned_whatsapp_business_accounts?fields=id,name&access_token=${longLivedToken}`
        );
        const wabaData = await wabaRes.json();

        if (wabaData.data && wabaData.data.length > 0) {
          for (const waba of wabaData.data) {
            const phoneRes = await fetch(
              `${GRAPH_API}/${waba.id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status&access_token=${longLivedToken}`
            );
            const phoneData = await phoneRes.json();

            if (phoneData.data && phoneData.data.length > 0) {
              const phone = phoneData.data[0];
              selectedWabaId = waba.id;
              selectedPhoneId = phone.id;
              displayPhone = phone.display_phone_number || "";
              businessName = phone.verified_name || waba.name || biz.name || "";
              isActive = true;
              console.log("Auto-discovered phone:", displayPhone, "WABA:", selectedWabaId);
              break;
            }
          }
          if (isActive) break;
        }
      }
    } catch (autoErr) {
      console.error("Auto-discovery failed (non-fatal):", autoErr);
    }

    await supabase.from("whatsapp_configs").upsert(
      {
        user_id: state,
        access_token: longLivedToken,
        phone_number_id: selectedPhoneId,
        waba_id: selectedWabaId,
        display_phone: displayPhone || null,
        business_name: businessName || null,
        is_active: isActive,
        webhook_verified: false,
      },
      { onConflict: "user_id" }
    );

    const redirectParam = isActive ? "wa_connected=true" : "wa_token_ready=true";
    console.log("Redirecting with:", redirectParam);

    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/integrations?${redirectParam}` },
    });
  } catch (e) {
    console.error("WhatsApp OAuth callback error:", e);
    const appUrl = Deno.env.get("APP_URL") || "https://dealflow-spark-68.lovable.app";
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/integrations?wa_error=${encodeURIComponent("Error del servidor: " + (e as Error).message)}` },
    });
  }
});
