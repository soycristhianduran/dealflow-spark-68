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

    // Save token as pending — WABA selection happens in the wizard after redirect.
    // This allows admins who manage multiple businesses with one Facebook account
    // to choose the correct WABA for each CRM tenant instead of auto-connecting
    // whichever happens to appear first in the API.
    await supabase.from("whatsapp_configs").upsert(
      {
        user_id: state,
        access_token: longLivedToken,
        phone_number_id: "pending",
        waba_id: "pending",
        display_phone: null,
        business_name: null,
        is_active: false,
        webhook_verified: false,
      },
      { onConflict: "user_id" }
    );

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
    // Always go to WABA selection step — never auto-complete
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}${basePath}?wa_token_ready=true` },
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
