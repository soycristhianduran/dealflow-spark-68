import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

// Resolve the workspace slug for a given user so we redirect them back to
// /w/:slug/integrations (the real route) instead of /integrations which 404s.
async function resolveOrgSlug(supabase: any, userId: string): Promise<string | null> {
  try {
    const { data: memberRow } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!memberRow?.organization_id) return null;
    const { data: orgRow } = await supabase
      .from("organizations")
      .select("slug")
      .eq("id", memberRow.organization_id)
      .maybeSingle();
    return orgRow?.slug ?? null;
  } catch (_) {
    return null;
  }
}

function buildRedirect(appUrl: string, slug: string | null, query: string): string {
  const base = slug ? `/w/${slug}/integrations` : `/integrations`;
  return `${appUrl}${base}?${query}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // single-use nonce (see migration 20260519000000)
    const error = url.searchParams.get("error");

    const SUPABASE_URL_EARLY = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_KEY_EARLY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const earlySupabase = createClient(SUPABASE_URL_EARLY, SUPABASE_SERVICE_KEY_EARLY);
    const appUrl = Deno.env.get("APP_URL") || "https://dealflow-spark-68.lovable.app";

    // ── Validate & consume the CSRF nonce ──────────────────────────────────
    // Primary path: state is a single-use nonce created by create_oauth_state().
    // Fallback: state is the raw user UUID (used when the RPC table is not yet
    // available; less CSRF-safe but acceptable during DB migration windows).
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let userId: string | null = null;
    let organizationId: string | null = null;
    if (state) {
      // 1. Try nonce-based validation first (returns JSONB {user_id, organization_id})
      const { data: consumed, error: consumeErr } = await earlySupabase.rpc(
        "consume_oauth_state",
        { p_token: state, p_provider: "facebook" },
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
      console.warn("OAuth callback rejected: invalid/expired/replayed state token");
      return new Response(null, {
        status: 302,
        headers: { "Location": `${appUrl}/integrations?fb_error=invalid_state` },
      });
    }

    if (error) {
      const slug = await resolveOrgSlug(earlySupabase, userId);
      return new Response(null, {
        status: 302,
        headers: { "Location": buildRedirect(appUrl, slug, `fb_error=${encodeURIComponent(error)}`) },
      });
    }

    if (!code) {
      const slug = await resolveOrgSlug(earlySupabase, userId);
      return new Response(null, {
        status: 302,
        headers: { "Location": buildRedirect(appUrl, slug, "fb_error=missing_code") },
      });
    }

    const META_APP_ID = Deno.env.get("META_APP_ID");
    const META_APP_SECRET = Deno.env.get("META_APP_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!META_APP_ID || !META_APP_SECRET) {
      return new Response("Meta credentials not configured", { status: 500, headers: corsHeaders });
    }

    const redirectUri = `${SUPABASE_URL}/functions/v1/facebook-oauth-callback`;

    // Exchange code for short-lived token
    const tokenRes = await fetch(
      `${GRAPH_API}/oauth/access_token?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${META_APP_SECRET}&code=${code}`
    );
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("Token exchange failed:", tokenData);
      const slug = await resolveOrgSlug(earlySupabase, userId);
      return new Response(null, {
        status: 302,
        headers: { "Location": buildRedirect(appUrl, slug, "fb_error=token_exchange_failed") },
      });
    }

    // Exchange for long-lived token
    const longTokenRes = await fetch(
      `${GRAPH_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
    );
    const longTokenData = await longTokenRes.json();
    const longLivedToken = longTokenData.access_token || tokenData.access_token;
    const expiresIn = longTokenData.expires_in || 5184000; // default 60 days

    // Capture the Facebook App-Scoped User ID (ASID). Required for the
    // Meta data-deletion callback to match revocation events back to this
    // user's stored data. Failure here is non-fatal — we just won't be able
    // to auto-delete this user's data if they later revoke from Facebook
    // (they can still trigger deletion manually inside the CRM).
    let fbUserId: string | null = null;
    try {
      const meRes = await fetch(
        `${GRAPH_API}/me?fields=id&access_token=${encodeURIComponent(longLivedToken)}`,
      );
      const meData = await meRes.json();
      if (meData?.id) {
        fbUserId = String(meData.id);
      } else {
        console.warn("Failed to fetch FB ASID — /me response:", meData);
      }
    } catch (e) {
      console.warn("FB ASID fetch threw:", e);
    }

    // Store in DB — userId comes from the consume_oauth_state RPC above,
    // NOT from the raw `state` query param (which is now an opaque nonce).
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Upsert scoped by (user_id, organization_id) so each org has its own token.
    // Falls back to upsert by user_id alone when org is unknown (backward compat).
    if (organizationId) {
      await supabase.from("facebook_tokens").upsert(
        {
          user_id: userId,
          organization_id: organizationId,
          access_token: longLivedToken,
          token_expires_at: expiresAt,
          fb_user_id: fbUserId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,organization_id" }
      );
    } else {
      await supabase.from("facebook_tokens").upsert(
        {
          user_id: userId,
          access_token: longLivedToken,
          token_expires_at: expiresAt,
          fb_user_id: fbUserId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    }

    // Redirect using the org from the state, or resolve it as fallback
    let slug: string | null = null;
    if (organizationId) {
      const { data: orgRow } = await supabase.from("organizations").select("slug").eq("id", organizationId).maybeSingle();
      slug = orgRow?.slug ?? null;
    } else {
      slug = await resolveOrgSlug(supabase, userId);
    }
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, "Location": buildRedirect(appUrl, slug, "fb_connected=true") },
    });
  } catch (e) {
    console.error("Facebook OAuth callback error:", e);
    const appUrl = Deno.env.get("APP_URL") || "https://dealflow-spark-68.lovable.app";
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, "Location": `${appUrl}/integrations?fb_error=true` },
    });
  }
});
