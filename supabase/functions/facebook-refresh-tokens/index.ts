// Facebook / Instagram token refresh job
// ---------------------------------------
// Refreshes long-lived user access tokens that are within 7 days of
// expiry, AND re-derives the page tokens stored in `facebook_pages` and
// `instagram_accounts`. Page tokens themselves don't expire while the
// underlying user token is valid, but if the user has revoked permissions
// or changed password, the page tokens silently go invalid — we detect
// that and flip `needs_reconnect = true` so the UI can prompt for a
// reconnect.
//
// Invoked daily at 03:00 UTC by pg_cron (see migration 20260520000000).
// Also reachable manually (POST with service_role auth) for ad-hoc runs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";
const IG_GRAPH_API = "https://graph.instagram.com/v21.0";

interface RefreshResult {
  refreshed: number;            // user tokens successfully refreshed
  failed: number;               // user tokens that failed (marked needs_reconnect)
  pages_updated: number;        // page-level tokens re-derived
  ig_accounts_updated: number;  // IG accounts whose page token was re-derived
  ig_invalidated: number;       // IG accounts whose token is dead (190) → flagged
  total: number;                // tokens considered for refresh
}

/**
 * Directly validate every active Instagram account's stored token against the
 * Graph API and flag the dead ones for reconnection.
 *
 * This is the catch-all the user-token refresh above misses:
 *  • Instagram Login accounts ("IGAA..." tokens) have NO facebook_tokens row,
 *    so the refresh loop never touches them.
 *  • Page-based accounts whose facebook_tokens row is missing/stale.
 *
 * A code-190 response (password change / revoked / session invalidated) is the
 * only signal we act on — transient/network errors are ignored so we never
 * flag a healthy account by mistake.
 */
async function validateIgAccounts(supabase: any): Promise<number> {
  const { data: accounts, error } = await supabase
    .from("instagram_accounts")
    .select("id, ig_user_id, page_id, page_access_token")
    .eq("is_active", true)
    .eq("needs_reconnect", false);

  if (error || !accounts?.length) return 0;

  let flagged = 0;
  for (const acc of accounts) {
    const token: string | null = acc.page_access_token;
    if (!token) continue;

    // IG Login token → graph.instagram.com (validate the IG user node).
    // Page token → graph.facebook.com (validate the page node).
    const isIgLogin = token.startsWith("IGAA");
    const host = isIgLogin ? IG_GRAPH_API : GRAPH_API;
    const node = isIgLogin ? (acc.ig_user_id || "me") : (acc.page_id || "me");

    try {
      const res = await fetch(`${host}/${node}?fields=id&access_token=${encodeURIComponent(token)}`);
      const data = await res.json().catch(() => ({}));
      if (data?.error?.code === 190) {
        const msg = data.error.message?.slice(0, 500) || "token invalidated (190)";
        await supabase
          .from("instagram_accounts")
          .update({
            needs_reconnect: true,
            last_refresh_at: new Date().toISOString(),
            last_refresh_error: msg,
          })
          .eq("id", acc.id);
        flagged++;
      }
    } catch (_e) {
      // Transient / network error — leave the account alone for next run.
    }
  }
  return flagged;
}

/**
 * Re-derive page access tokens after refreshing the underlying user token.
 *
 * Returns the count of facebook_pages and instagram_accounts updated.
 * Failures here are logged but do not fail the whole refresh — page tokens
 * that can't be re-derived will keep their old value and will eventually
 * surface as 401s in normal usage.
 */
async function rederivePageTokens(
  supabase: any,
  userId: string,
  newUserToken: string,
): Promise<{ pages_updated: number; ig_accounts_updated: number }> {
  let pagesUpdated = 0;
  let igUpdated = 0;

  // Fetch the fresh list of pages with their new page-level tokens
  const res = await fetch(
    `${GRAPH_API}/me/accounts?fields=id,access_token,name&access_token=${encodeURIComponent(newUserToken)}`,
  );
  const data = await res.json();

  if (!data?.data || !Array.isArray(data.data)) {
    console.warn(`/me/accounts returned no data for user ${userId}:`, data);
    return { pages_updated: 0, ig_accounts_updated: 0 };
  }

  for (const page of data.data) {
    if (!page.id || !page.access_token) continue;

    // Update facebook_pages
    const { error: pageErr } = await supabase
      .from("facebook_pages")
      .update({ page_access_token: page.access_token })
      .eq("user_id", userId)
      .eq("page_id", page.id);
    if (!pageErr) pagesUpdated++;

    // Update any instagram_accounts that ride on this page
    const { error: igErr, count } = await supabase
      .from("instagram_accounts")
      .update({
        page_access_token: page.access_token,
        needs_reconnect: false,
        last_refresh_at: new Date().toISOString(),
        last_refresh_error: null,
      }, { count: "exact" })
      .eq("user_id", userId)
      .eq("page_id", page.id);
    if (!igErr && count) igUpdated += count;
  }

  return { pages_updated: pagesUpdated, ig_accounts_updated: igUpdated };
}

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

    // Always validate IG account tokens directly first — this catches dead
    // tokens (Instagram Login + page-based) that the user-token refresh below
    // never inspects. Runs regardless of whether any facebook_tokens are due.
    const igInvalidated = await validateIgAccounts(supabase);

    // Pick up tokens that:
    //   - expire within 7 days, AND
    //   - are NOT already flagged needs_reconnect (avoid retrying broken ones
    //     every day; the user will reconnect explicitly via the UI banner)
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: tokens, error: fetchError } = await supabase
      .from("facebook_tokens")
      .select("id, user_id, access_token, token_expires_at, needs_reconnect")
      .lt("token_expires_at", sevenDaysFromNow)
      .eq("needs_reconnect", false);

    if (fetchError) throw fetchError;

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: "No tokens need refresh", refreshed: 0, failed: 0, pages_updated: 0, ig_accounts_updated: 0, ig_invalidated: igInvalidated, total: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result: RefreshResult = {
      refreshed: 0,
      failed: 0,
      pages_updated: 0,
      ig_accounts_updated: 0,
      ig_invalidated: igInvalidated,
      total: tokens.length,
    };

    for (const token of tokens) {
      try {
        // Exchange the current long-lived token for a new long-lived token.
        const res = await fetch(
          `${GRAPH_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${encodeURIComponent(token.access_token)}`,
        );
        const data = await res.json();

        if (data.access_token) {
          const expiresIn = data.expires_in || 5184000; // 60 days default
          const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

          // Update the user token row first
          await supabase.from("facebook_tokens").update({
            access_token: data.access_token,
            token_expires_at: expiresAt,
            updated_at: new Date().toISOString(),
            last_refresh_at: new Date().toISOString(),
            last_refresh_error: null,
            needs_reconnect: false,
          }).eq("id", token.id);

          // Re-derive the page tokens so IG/FB pages keep working
          try {
            const pageStats = await rederivePageTokens(supabase, token.user_id, data.access_token);
            result.pages_updated += pageStats.pages_updated;
            result.ig_accounts_updated += pageStats.ig_accounts_updated;
            console.log(
              `User ${token.user_id}: token refreshed (expires ${expiresAt}), ` +
              `${pageStats.pages_updated} page tokens + ${pageStats.ig_accounts_updated} IG accounts updated`,
            );
          } catch (pageErr) {
            console.error(`Page re-derivation failed for user ${token.user_id}:`, pageErr);
          }

          result.refreshed++;
        } else {
          // Permanent failure (most commonly: user revoked permissions on
          // Meta's side, or password change invalidated all tokens). Mark
          // for reconnection so the UI can prompt and we don't keep
          // retrying every day.
          const errorMessage =
            data.error?.message || JSON.stringify(data).slice(0, 500);
          console.error(`Refresh failed for user ${token.user_id}: ${errorMessage}`);

          await supabase.from("facebook_tokens").update({
            needs_reconnect: true,
            last_refresh_at: new Date().toISOString(),
            last_refresh_error: errorMessage,
          }).eq("id", token.id);

          // Cascade the reconnect flag to any IG accounts riding on this user
          await supabase.from("instagram_accounts").update({
            needs_reconnect: true,
            last_refresh_at: new Date().toISOString(),
            last_refresh_error: errorMessage,
          }).eq("user_id", token.user_id);

          result.failed++;
        }
      } catch (e) {
        // Network / transient error — DON'T flag needs_reconnect; let the
        // next daily run retry.
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`Transient error refreshing user ${token.user_id}: ${msg}`);
        await supabase.from("facebook_tokens").update({
          last_refresh_at: new Date().toISOString(),
          last_refresh_error: `transient: ${msg.slice(0, 400)}`,
        }).eq("id", token.id);
        result.failed++;
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Token refresh error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
