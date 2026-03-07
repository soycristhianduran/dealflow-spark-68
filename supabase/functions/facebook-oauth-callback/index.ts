import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // contains user_id
    const error = url.searchParams.get("error");

    if (error) {
      return new Response(`<html><body><script>window.opener?.postMessage({type:'fb-oauth-error',error:'${error}'},'*');window.close();</script></body></html>`, {
        headers: { "Content-Type": "text/html" },
      });
    }

    if (!code || !state) {
      return new Response("Missing code or state", { status: 400, headers: corsHeaders });
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
      return new Response(`<html><body><script>window.opener?.postMessage({type:'fb-oauth-error',error:'token_exchange_failed'},'*');window.close();</script></body></html>`, {
        headers: { "Content-Type": "text/html" },
      });
    }

    // Exchange for long-lived token
    const longTokenRes = await fetch(
      `${GRAPH_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
    );
    const longTokenData = await longTokenRes.json();
    const longLivedToken = longTokenData.access_token || tokenData.access_token;
    const expiresIn = longTokenData.expires_in || 5184000; // default 60 days

    // Store in DB
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userId = state;

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    await supabase.from("facebook_tokens").upsert(
      {
        user_id: userId,
        access_token: longLivedToken,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    // Success - redirect back to app or close popup
    const appUrl = Deno.env.get("APP_URL") || "https://dealflow-spark-68.lovable.app";
    return new Response(
      `<html><body><script>
        if (window.opener) {
          window.opener.postMessage({type:'fb-oauth-success'},'*');
          window.close();
        } else {
          window.location.href = '${appUrl}/integrations?fb_connected=true';
        }
      </script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (e) {
    console.error("Facebook OAuth callback error:", e);
    return new Response(
      `<html><body><script>window.opener?.postMessage({type:'fb-oauth-error',error:'server_error'},'*');window.close();</script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
});
