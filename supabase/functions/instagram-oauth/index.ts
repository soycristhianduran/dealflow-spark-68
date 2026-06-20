import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────────────────────
// Instagram Business Login (Instagram API with Instagram Login)
// ─────────────────────────────────────────────────────────────────────────────
// Connects an Instagram professional account DIRECTLY through Instagram Login
// (NOT through a Facebook Page). Produces a long-lived "IGAA…" token used with
// graph.instagram.com. This is the path that uses the dedicated Instagram app
// (META_APP_ID_IG / META_APP_SECRET_IG) where Advanced Access to
// instagram_business_manage_messages / _manage_comments lives.
//
// Two entry points on ONE function URL:
//   • POST { action: "get_authorize_url" } (with JWT) → returns the authorize URL
//   • GET  ?code=…&state=…                (Meta redirect, no JWT) → exchanges +
//     stores the account, then 302-redirects back into the app.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const IG_GRAPH = "https://graph.instagram.com";
const IG_GRAPH_V = "https://graph.instagram.com/v21.0";
const IG_OAUTH_AUTHORIZE = "https://www.instagram.com/oauth/authorize";
const IG_OAUTH_TOKEN = "https://api.instagram.com/oauth/access_token";

// Scopes requested for the Instagram messaging + comments use case.
const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
].join(",");

function buildRedirect(appUrl: string, slug: string | null, query: string): string {
  const base = slug ? `/w/${slug}/integrations` : `/integrations`;
  return `${appUrl}${base}?${query}`;
}

async function resolveOrgSlug(supabase: any, organizationId: string | null, userId: string): Promise<string | null> {
  try {
    if (organizationId) {
      const { data: orgRow } = await supabase.from("organizations").select("slug").eq("id", organizationId).maybeSingle();
      if (orgRow?.slug) return orgRow.slug;
    }
    const { data: memberRow } = await supabase
      .from("organization_members").select("organization_id").eq("user_id", userId).maybeSingle();
    if (!memberRow?.organization_id) return null;
    const { data: orgRow } = await supabase
      .from("organizations").select("slug").eq("id", memberRow.organization_id).maybeSingle();
    return orgRow?.slug ?? null;
  } catch (_) {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const appUrl = Deno.env.get("APP_URL") || "https://app.klosify.com";
  const IG_APP_ID = Deno.env.get("META_APP_ID_IG");
  const IG_APP_SECRET = Deno.env.get("META_APP_SECRET_IG");
  const redirectUri = `${SUPABASE_URL}/functions/v1/instagram-oauth`;

  const service = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // ── POST: build the authorize URL (called from the app, with JWT) ─────────
    if (req.method === "POST") {
      if (!IG_APP_ID) {
        return new Response(JSON.stringify({ error: "META_APP_ID_IG no está configurado" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const authHeader = req.headers.get("authorization");
      if (!authHeader) throw new Error("No authorization header");
      const jwt = authHeader.replace("Bearer ", "");

      const body = await req.json().catch(() => ({}));
      // Verify the user with the explicit JWT (getUser() with no arg returns
      // null in the edge runtime — there is no persisted session).
      const { data: { user }, error: authErr } = await service.auth.getUser(jwt);
      if (authErr || !user) throw new Error("Unauthorized");

      // Separate client that FORWARDS the user's JWT so create_oauth_state's
      // auth.uid() resolves to them (it runs as the `authenticated` role).
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });

      // Resolve org (from body or membership) for state + later scoping.
      let organizationId: string | null = body.organization_id ?? null;
      if (!organizationId) {
        const { data: mem } = await service
          .from("organization_members").select("organization_id").eq("user_id", user.id).maybeSingle();
        organizationId = mem?.organization_id ?? null;
      }

      const { data: state, error: stateErr } = await userClient.rpc("create_oauth_state", {
        p_provider: "instagram",
        p_organization_id: organizationId,
      });
      if (stateErr || !state) throw new Error("No se pudo generar el state: " + (stateErr?.message || "null"));

      const authorizeUrl =
        `${IG_OAUTH_AUTHORIZE}?client_id=${IG_APP_ID}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code&scope=${encodeURIComponent(IG_SCOPES)}` +
        `&state=${encodeURIComponent(state)}`;

      return new Response(JSON.stringify({ url: authorizeUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── GET: OAuth callback from Instagram (no JWT) ───────────────────────────
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");

    // Validate + consume the CSRF nonce → { user_id, organization_id }
    let userId: string | null = null;
    let organizationId: string | null = null;
    if (state) {
      const { data: consumed } = await service.rpc("consume_oauth_state", { p_token: state, p_provider: "instagram" });
      if (consumed && typeof consumed === "object") {
        userId = (consumed as any).user_id || null;
        organizationId = (consumed as any).organization_id || null;
      }
    }
    if (!userId) {
      return new Response(null, { status: 302, headers: { "Location": `${appUrl}/integrations?ig_error=invalid_state` } });
    }
    if (oauthError) {
      const slug = await resolveOrgSlug(service, organizationId, userId);
      return new Response(null, { status: 302, headers: { "Location": buildRedirect(appUrl, slug, `ig_error=${encodeURIComponent(oauthError)}`) } });
    }
    if (!code || !IG_APP_ID || !IG_APP_SECRET) {
      const slug = await resolveOrgSlug(service, organizationId, userId);
      return new Response(null, { status: 302, headers: { "Location": buildRedirect(appUrl, slug, "ig_error=missing_code_or_config") } });
    }

    // 1) Exchange code → short-lived token (form-encoded POST)
    const form = new URLSearchParams();
    form.set("client_id", IG_APP_ID);
    form.set("client_secret", IG_APP_SECRET);
    form.set("grant_type", "authorization_code");
    form.set("redirect_uri", redirectUri);
    form.set("code", code);
    const shortRes = await fetch(IG_OAUTH_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const shortData = await shortRes.json();
    if (!shortData.access_token) {
      console.error("IG short token exchange failed:", JSON.stringify(shortData));
      const slug = await resolveOrgSlug(service, organizationId, userId);
      return new Response(null, { status: 302, headers: { "Location": buildRedirect(appUrl, slug, "ig_error=token_exchange_failed") } });
    }
    const shortToken = shortData.access_token;

    // 2) Exchange short → long-lived IGAA token (60 days)
    const longRes = await fetch(
      `${IG_GRAPH}/access_token?grant_type=ig_exchange_token&client_secret=${IG_APP_SECRET}&access_token=${encodeURIComponent(shortToken)}`,
    );
    const longData = await longRes.json();
    const longToken = longData.access_token || shortToken;

    // 3) Fetch the IG account profile
    const meRes = await fetch(
      `${IG_GRAPH_V}/me?fields=user_id,username,name,profile_picture_url&access_token=${encodeURIComponent(longToken)}`,
    );
    const me = await meRes.json();
    const igUserId = String(me.user_id || me.id || "");
    if (!igUserId) {
      console.error("IG /me returned no id:", JSON.stringify(me));
      const slug = await resolveOrgSlug(service, organizationId, userId);
      return new Response(null, { status: 302, headers: { "Location": buildRedirect(appUrl, slug, "ig_error=profile_failed") } });
    }

    // Resolve org if the state didn't carry it
    if (!organizationId) {
      const { data: mem } = await service
        .from("organization_members").select("organization_id").eq("user_id", userId).maybeSingle();
      organizationId = mem?.organization_id ?? null;
    }

    // 4) Store the account (deactivate previous for this user → one active)
    await service.from("instagram_accounts").update({ is_active: false }).eq("user_id", userId);
    const { error: upsertErr } = await service.from("instagram_accounts").upsert(
      {
        user_id: userId,
        organization_id: organizationId,
        ig_user_id: igUserId,
        ig_username: me.username ?? null,
        profile_picture_url: me.profile_picture_url ?? null,
        page_id: null,            // IG-Login accounts are NOT tied to a FB page
        page_name: me.name ?? null,
        page_access_token: longToken, // IGAA… token → routes to graph.instagram.com
        fb_user_id: null,
        is_active: true,
        last_refresh_at: new Date().toISOString(),
        needs_reconnect: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,ig_user_id" },
    );
    if (upsertErr) {
      console.error("instagram_accounts upsert failed:", JSON.stringify(upsertErr));
      const slug = await resolveOrgSlug(service, organizationId, userId);
      const detail = encodeURIComponent((upsertErr.message || upsertErr.code || JSON.stringify(upsertErr)).slice(0, 200));
      return new Response(null, { status: 302, headers: { "Location": buildRedirect(appUrl, slug, `ig_error=save_failed:${detail}`) } });
    }

    // 5) Subscribe the IG account to messages + comments webhooks
    let subscribeWarning = "";
    try {
      const subRes = await fetch(`${IG_GRAPH_V}/${igUserId}/subscribed_apps`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${longToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ subscribed_fields: "messages,comments" }),
      });
      const subData = await subRes.json();
      console.log("instagram-oauth subscribed_apps:", JSON.stringify(subData));
      if (subData?.error) subscribeWarning = `&ig_warn=${encodeURIComponent(subData.error.message)}`;
    } catch (e) {
      console.warn("IG subscribe threw:", e);
    }

    const slug = await resolveOrgSlug(service, organizationId, userId);
    return new Response(null, {
      status: 302,
      headers: { "Location": buildRedirect(appUrl, slug, `ig_connected=true${subscribeWarning}`) },
    });
  } catch (e: any) {
    console.error("instagram-oauth error:", e?.message || e);
    if (req.method === "POST") {
      // Return 200 with the error so the client surfaces the real reason in the
      // toast (functions.invoke hides the body on non-2xx).
      return new Response(JSON.stringify({ error: "IG-OAUTH: " + (e?.message || String(e)) }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(null, { status: 302, headers: { "Location": `${appUrl}/integrations?ig_error=true` } });
  }
});
