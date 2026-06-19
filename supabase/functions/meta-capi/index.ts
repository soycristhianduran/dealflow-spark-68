// Meta Conversions API (CAPI) relay — public edge function.
// Receives an event from the browser and forwards it to Meta's Graph API
// using the server-side access token (NEVER exposed to the client).
//
// Required secrets (set in Supabase, not in code):
//   META_CAPI_TOKEN  — the system-user access token for the pixel
//   META_PIXEL_ID    — (optional) defaults to the pixel id below
//   META_TEST_EVENT_CODE — (optional) for Events Manager "Test Events"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PIXEL_ID = Deno.env.get("META_PIXEL_ID") || "895291419505730";
const GRAPH = `https://graph.facebook.com/v21.0/${PIXEL_ID}/events`;

async function sha256(value: string): Promise<string> {
  const norm = value.trim().toLowerCase();
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const token = Deno.env.get("META_CAPI_TOKEN");
  if (!token) {
    return new Response(JSON.stringify({ error: "META_CAPI_TOKEN not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const {
      event_name = "PageView",
      event_id,
      event_source_url,
      fbp, fbc,
      custom_data = {},
      user_data = {},
    } = body ?? {};

    // Build hashed user_data (Meta requires SHA-256 for PII)
    const ud: Record<string, unknown> = {};
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ua = req.headers.get("user-agent") || undefined;
    if (ip) ud.client_ip_address = ip;
    if (ua) ud.client_user_agent = ua;
    if (fbp) ud.fbp = fbp;
    if (fbc) ud.fbc = fbc;
    if (user_data.email) ud.em = [await sha256(user_data.email)];
    if (user_data.phone) ud.ph = [await sha256(String(user_data.phone).replace(/[^\d]/g, ""))];
    if (user_data.firstName) ud.fn = [await sha256(user_data.firstName)];
    if (user_data.lastName) ud.ln = [await sha256(user_data.lastName)];

    const payload: Record<string, unknown> = {
      data: [{
        event_name,
        event_time: Math.floor(Date.now() / 1000),
        event_id,
        event_source_url,
        action_source: "website",
        user_data: ud,
        custom_data,
      }],
    };
    const testCode = Deno.env.get("META_TEST_EVENT_CODE");
    if (testCode) payload.test_event_code = testCode;

    const res = await fetch(`${GRAPH}?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();

    return new Response(JSON.stringify(json), {
      status: res.ok ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
