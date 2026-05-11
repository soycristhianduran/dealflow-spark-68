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

    console.log("WhatsApp OAuth callback received:", { hasCode: !!code, state, error, errorReason });

    if (error) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/integrations?wa_error=${encodeURIComponent(errorReason || error)}` },
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
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/integrations?wa_error=${encodeURIComponent("META_APP_ID o META_APP_SECRET no configurados")}` },
      });
    }

    const redirectUri = `${SUPABASE_URL}/functions/v1/whatsapp-oauth-callback`;

    // Exchange code for short-lived token
    const tokenRes = await fetch(
      `${GRAPH_API}/oauth/access_token?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${META_APP_SECRET}&code=${code}`
    );
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("Token exchange failed:", JSON.stringify(tokenData));
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/integrations?wa_error=${encodeURIComponent(tokenData.error?.message || "Error intercambiando token")}` },
      });
    }

    // Exchange for long-lived token
    const longRes = await fetch(
      `${GRAPH_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
    );
    const longData = await longRes.json();
    const longLivedToken = longData.access_token || tokenData.access_token;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Auto-discover WABA and phone
    let selectedWabaId = "pending";
    let selectedPhoneId = "pending";
    let displayPhone = "";
    let businessName = "";
    let businessAccountId = "";
    let isActive = false;

    try {
      const bizRes = await fetch(`${GRAPH_API}/me/businesses?fields=id,name&access_token=${longLivedToken}`);
      const bizData = await bizRes.json();

      for (const biz of (bizData.data || [])) {
        const wabaRes = await fetch(
          `${GRAPH_API}/${biz.id}/owned_whatsapp_business_accounts?fields=id,name&access_token=${longLivedToken}`
        );
        const wabaData = await wabaRes.json();

        if (wabaData.data?.length > 0) {
          for (const waba of wabaData.data) {
            const phoneRes = await fetch(
              `${GRAPH_API}/${waba.id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status&access_token=${longLivedToken}`
            );
            const phoneData = await phoneRes.json();

            if (phoneData.data?.length > 0) {
              const phone = phoneData.data[0];
              businessAccountId = biz.id;
              selectedWabaId = waba.id;
              selectedPhoneId = phone.id;
              displayPhone = phone.display_phone_number || "";
              businessName = phone.verified_name || waba.name || biz.name || "";
              isActive = true;
              break;
            }
          }
          if (isActive) break;
        }
      }
    } catch (autoErr) {
      console.error("Auto-discovery failed (non-fatal):", autoErr);
    }

    // Save to whatsapp_configs (backward compatible)
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

    // Also save to channels table (new modular approach)
    if (isActive) {
      await supabase.from("channels").upsert(
        {
          user_id: state,
          type: "whatsapp",
          provider: "meta",
          business_account_id: businessAccountId,
          waba_id: selectedWabaId,
          phone_number_id: selectedPhoneId,
          access_token: longLivedToken,
          display_phone: displayPhone || null,
          business_name: businessName || null,
          is_active: true,
          status: "connected",
          connected_at: new Date().toISOString(),
        },
        { onConflict: "user_id,type,phone_number_id", ignoreDuplicates: false }
      );
    }

    // Look up user's org slug so we redirect to the correct slug URL
    let orgSlug: string | null = null;
    try {
      const { data: memberRow } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", state)
        .maybeSingle();
      if (memberRow?.organization_id) {
        const { data: orgRow } = await supabase
          .from("organizations")
          .select("slug")
          .eq("id", memberRow.organization_id)
          .maybeSingle();
        orgSlug = orgRow?.slug ?? null;
      }
    } catch (_) { /* non-fatal — fall back to /integrations */ }

    const basePath = orgSlug ? `/w/${orgSlug}/integrations` : `/integrations`;
    const redirectParam = isActive ? "wa_connected=true" : "wa_token_ready=true";
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}${basePath}?${redirectParam}` },
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
