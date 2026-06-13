import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Dedicated Google Calendar OAuth callback (separate from app login).
 *
 * Flow:
 *   1. Frontend redirects the user to Google's consent screen with
 *      redirect_uri = THIS function, access_type=offline & prompt=consent
 *      (so Google returns a refresh_token), and state = { jwt, return_url }.
 *   2. Google redirects back here with ?code=...&state=...
 *   3. We exchange the code for { access_token, refresh_token }, verify the
 *      user from the JWT in state, store both tokens in google_calendar_tokens,
 *      then redirect the browser back to the app.
 *
 * This guarantees a refresh_token (which Supabase's signInWithOAuth did not
 * reliably provide), so the agent can create calendar events at any time.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-calendar-callback`;

function redirect(to: string) {
  return new Response(null, { status: 302, headers: { Location: to } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  // Decode state early so we know where to send the user back
  let returnUrl = "/";
  let jwt = "";
  try {
    if (stateRaw) {
      const s = JSON.parse(atob(stateRaw));
      returnUrl = s.return_url || "/";
      jwt = s.jwt || "";
    }
  } catch { /* ignore */ }

  const back = (params: string) => {
    const sep = returnUrl.includes("?") ? "&" : "?";
    return redirect(`${returnUrl}${sep}${params}`);
  };

  if (oauthError) return back(`gcal=error&reason=${encodeURIComponent(oauthError)}`);
  if (!code) return back("gcal=error&reason=no_code");

  try {
    // 1. Exchange the authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.access_token) {
      console.error("google token exchange failed:", tokens);
      return back("gcal=error&reason=token_exchange");
    }

    // 2. Verify the user from the JWT (prevents spoofing someone else's id)
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: { user }, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !user) return back("gcal=error&reason=auth");

    // 3. Store tokens. Google only returns refresh_token on consent; keep the
    //    existing one if a refresh wasn't included this time.
    const update: Record<string, unknown> = {
      user_id: user.id,
      provider_token: tokens.access_token,
      updated_at: new Date().toISOString(),
    };
    if (tokens.refresh_token) update.provider_refresh_token = tokens.refresh_token;

    const { error: upErr } = await supabase
      .from("google_calendar_tokens")
      .upsert(update, { onConflict: "user_id" });
    if (upErr) {
      console.error("token upsert failed:", upErr);
      return back("gcal=error&reason=save");
    }

    return back("gcal=connected");
  } catch (e) {
    console.error("google-calendar-callback error:", e);
    return back("gcal=error&reason=server");
  }
});
