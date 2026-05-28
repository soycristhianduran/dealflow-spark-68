import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Internal Edge Function — called by pg_net DB triggers.
// No JWT verification needed; it only reads webhook_subscriptions and
// POSTs to user-configured URLs. No sensitive data is exposed.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
};

// HMAC-SHA256 using the Web Crypto API (no external deps)
async function hmacSha256(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body: { event: string; organization_id: string; data: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { event, organization_id, data } = body;
  if (!event || !organization_id) {
    return new Response("Missing event or organization_id", { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Find all active subscriptions that listen to this event
  const { data: subscriptions, error } = await supabase
    .from("webhook_subscriptions")
    .select("id, url, secret, failure_count")
    .eq("organization_id", organization_id)
    .eq("is_active", true)
    .contains("events", [event]);

  if (error || !subscriptions?.length) {
    return new Response(JSON.stringify({ dispatched: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ event, timestamp, organization_id, data });

  let dispatched = 0;
  for (const sub of subscriptions) {
    const signature = await hmacSha256(sub.secret, payload);

    let success = false;
    try {
      const resp = await fetch(sub.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Event": event,
          "X-Webhook-Signature": `sha256=${signature}`,
          "X-Webhook-Timestamp": timestamp.toString(),
        },
        body: payload,
        signal: AbortSignal.timeout(10_000),
      });
      success = resp.ok;
      dispatched++;
    } catch {
      // timeout or network error — count as failure
    }

    // Update last_triggered_at and failure_count
    await supabase
      .from("webhook_subscriptions")
      .update({
        last_triggered_at: new Date().toISOString(),
        failure_count: success ? 0 : sub.failure_count + 1,
        // Auto-disable after 10 consecutive failures
        is_active: success ? true : sub.failure_count + 1 < 10,
      })
      .eq("id", sub.id);
  }

  return new Response(JSON.stringify({ dispatched }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});
