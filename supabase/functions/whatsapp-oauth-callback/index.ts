import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH_API = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // single-use nonce (CSRF protection)
    const error = url.searchParams.get("error");
    const errorReason = url.searchParams.get("error_reason");
    const appUrl = Deno.env.get("APP_URL") || "https://dealflow-spark-68.lovable.app";

    const SUPABASE_URL_EARLY = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_KEY_EARLY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const earlySupabase = createClient(SUPABASE_URL_EARLY, SUPABASE_SERVICE_KEY_EARLY);

    console.log("WhatsApp OAuth callback received:", { hasCode: !!code, hasState: !!state, error, errorReason });

    // ── Validate & consume the CSRF nonce ──────────────────────────────────
    // Primary path: state is a single-use nonce from create_oauth_state().
    // Fallback: state is the raw user UUID (used when the RPC table is not yet
    // available — same pattern as facebook-oauth-callback).
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let userId: string | null = null;
    let organizationId: string | null = null;
    if (state) {
      // 1. Try nonce-based validation first (returns JSONB {user_id, organization_id})
      const { data: consumed, error: consumeErr } = await earlySupabase.rpc(
        "consume_oauth_state",
        { p_token: state, p_provider: "whatsapp" },
      );
      if (consumeErr) {
        console.error("consume_oauth_state RPC failed:", consumeErr);
      }
      if (consumed && typeof consumed === "object") {
        userId = (consumed as any).user_id || null;
        organizationId = (consumed as any).organization_id || null;
      }

      // 2. Fallback: raw UUID state
      if (!userId && UUID_RE.test(state)) {
        console.warn("CSRF nonce not found; accepting raw UUID state as fallback");
        try {
          const { data: adminUser } = await earlySupabase.auth.admin.getUserById(state);
          if (adminUser?.user?.id) userId = adminUser.user.id;
        } catch (e) {
          console.error("UUID fallback lookup failed:", e);
        }
      }
    }
    if (!userId) {
      console.warn("WhatsApp OAuth callback rejected: invalid/expired/replayed state token");
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/integrations?wa_error=${encodeURIComponent("Sesión OAuth expirada o inválida. Intenta conectar de nuevo.")}` },
      });
    }

    if (error) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/integrations?wa_error=${encodeURIComponent(errorReason || error)}` },
      });
    }

    if (!code) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/integrations?wa_error=${encodeURIComponent("Falta parámetro code")}` },
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
    // Multi-number: delete any previous "pending" row so a second OAuth flow
    // (adding a new number) doesn't overwrite an already-active config.
    // Active configs (phone_number_id !== "pending") are never touched here.
    // Delete only the pending row for this specific org (if org known) or user
    const pendingDelete = supabase.from("whatsapp_configs")
      .delete()
      .eq("user_id", userId)
      .eq("phone_number_id", "pending");
    if (organizationId) pendingDelete.eq("organization_id", organizationId);
    await pendingDelete;

    await supabase.from("whatsapp_configs").insert({
      user_id: userId,
      organization_id: organizationId || null,
      access_token: longLivedToken,
      phone_number_id: "pending",
      waba_id: "pending",
      display_phone: null,
      business_name: null,
      is_active: false,
      is_primary: false,
      webhook_verified: false,
    });

    // Resolve org slug — use organizationId from state if available (fixes multi-org bug)
    let orgSlug: string | null = null;
    try {
      const orgIdToResolve = organizationId;
      if (orgIdToResolve) {
        const { data: orgRow } = await supabase
          .from("organizations")
          .select("slug")
          .eq("id", orgIdToResolve)
          .maybeSingle();
        orgSlug = orgRow?.slug ?? null;
      } else {
        // Fallback: pick first org (single-org users)
        const { data: memberRow } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", userId)
          .maybeSingle();
        if (memberRow?.organization_id) {
          const { data: orgRow } = await supabase
            .from("organizations")
            .select("slug")
            .eq("id", memberRow.organization_id)
            .maybeSingle();
          orgSlug = orgRow?.slug ?? null;
        }
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
