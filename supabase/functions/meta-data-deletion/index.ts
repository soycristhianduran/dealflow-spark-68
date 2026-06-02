// Meta Data Deletion Callback
// ---------------------------
// Required by Meta App Review. When a user revokes our app from their
// Facebook/Instagram account, Meta POSTs to this endpoint with a single
// form-encoded field `signed_request`. We must:
//
//   1. Verify the signed_request's HMAC-SHA256 against our app secret.
//   2. Respond synchronously with JSON: { url, confirmation_code }.
//   3. Delete the user's data within a reasonable window (Meta says "within
//      30 days" but doing it immediately is the right thing).
//
// The signed_request format is `<sig>.<payload>`, both base64url-encoded
// (no padding). The payload JSON contains: { algorithm, expires, issued_at, user_id }
// where user_id is the App-Scoped User ID (ASID).
//
// See: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// base64url helpers (Meta uses URL-safe base64 *without* padding)
// ---------------------------------------------------------------------------
function base64UrlDecode(input: string): Uint8Array {
  // Re-pad and convert URL-safe chars back to standard base64
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const bin = atob(padded + padding);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time string comparison
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Crypto-safe random confirmation code (URL-safe, ~22 chars)
function randomConfirmationCode(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  // base64url, no padding
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

// ---------------------------------------------------------------------------
// Verify and parse a Meta signed_request. Returns the decoded payload only
// when the HMAC matches one of the app secrets. Returns null otherwise.
// ---------------------------------------------------------------------------
async function verifyAndParse(
  signedRequest: string,
  secrets: string[],
): Promise<{ payload: any; matchedSecret: string } | null> {
  const parts = signedRequest.split(".");
  if (parts.length !== 2) return null;

  const [encodedSig, encodedPayload] = parts;
  let expectedSig: Uint8Array;
  try {
    expectedSig = base64UrlDecode(encodedSig);
  } catch (e) {
    // Malformed base64 → treat as invalid signature, not server error.
    console.warn("signed_request signature is not valid base64url:", e);
    return null;
  }
  const payloadBytes = new TextEncoder().encode(encodedPayload);

  for (const secret of secrets) {
    if (!secret) continue;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const computed = new Uint8Array(await crypto.subtle.sign("HMAC", key, payloadBytes));
    if (timingSafeEqual(computed, expectedSig)) {
      try {
        const payloadStr = new TextDecoder().decode(base64UrlDecode(encodedPayload));
        const payload = JSON.parse(payloadStr);
        if (payload.algorithm !== "HMAC-SHA256") {
          console.warn("signed_request algorithm is not HMAC-SHA256:", payload.algorithm);
          return null;
        }
        return { payload, matchedSecret: secret };
      } catch (e) {
        console.error("Failed to parse signed_request payload:", e);
        return null;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The actual deletion work. Runs in background after we respond to Meta.
// "Best effort" — failures are logged and the request row is marked failed
// for human follow-up; we do NOT retry automatically because Meta won't.
// ---------------------------------------------------------------------------
async function performDeletion(
  supabase: any,
  requestId: string,
  metaUserId: string,
): Promise<void> {
  try {
    // 1. Find every connection tied to this Meta ASID. A single ASID can map
    //    to multiple internal users if the same Facebook user connected from
    //    multiple CRM accounts (rare but legal).
    const { data: fbTokens } = await supabase
      .from("facebook_tokens")
      .select("user_id")
      .eq("fb_user_id", metaUserId);

    const { data: igAccounts } = await supabase
      .from("instagram_accounts")
      .select("user_id")
      .eq("fb_user_id", metaUserId);

    const affectedUserIds = Array.from(
      new Set<string>([
        ...(fbTokens || []).map((r: any) => r.user_id),
        ...(igAccounts || []).map((r: any) => r.user_id),
      ]),
    );

    // 2. For each affected internal user, delete all data sourced from this
    //    Meta identity. We DO NOT delete the user's CRM account itself —
    //    only the Meta-derived data. The user can still log in and use
    //    other features; they'll just see an empty IG/FB integration.
    for (const userId of affectedUserIds) {
      // Order matters: child tables before parents.
      // (Most tables have ON DELETE CASCADE so deleting the parent suffices,
      // but we're explicit for the ones that don't.)

      // Instagram (cascades messages/comments/conversations via FK)
      await supabase.from("instagram_accounts").delete()
        .eq("user_id", userId).eq("fb_user_id", metaUserId);

      // Facebook
      await supabase.from("facebook_messages").delete().eq("user_id", userId);
      await supabase.from("facebook_lead_forms").delete().eq("user_id", userId);
      await supabase.from("facebook_pages").delete().eq("user_id", userId);
      await supabase.from("meta_campaigns").delete().eq("user_id", userId);
      await supabase.from("facebook_tokens").delete()
        .eq("user_id", userId).eq("fb_user_id", metaUserId);
    }

    // 3. Audit-log success even when affectedUserIds is empty — Meta will
    //    sometimes send deletion requests for ASIDs we never saw (e.g. user
    //    revoked before completing OAuth). Treating that as "completed" is
    //    correct: there's nothing left to delete.
    await supabase.from("data_deletion_requests").update({
      status: "completed",
      affected_user_ids: affectedUserIds,
      completed_at: new Date().toISOString(),
    }).eq("id", requestId);

    console.log(
      `Deletion ${requestId}: completed for ASID ${metaUserId}, ` +
      `affected ${affectedUserIds.length} internal user(s)`,
    );
  } catch (err) {
    console.error(`Deletion ${requestId} failed:`, err);
    await supabase.from("data_deletion_requests").update({
      status: "failed",
      error_detail: err instanceof Error ? err.message : String(err),
      completed_at: new Date().toISOString(),
    }).eq("id", requestId);
  }
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // GET requests = public health-check (Meta validates URL is reachable)
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        ok: true,
        message: "Meta data deletion callback endpoint. POST signed_request to trigger deletion.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // Meta sends signed_request as application/x-www-form-urlencoded
  let signedRequest: string | null = null;
  const contentType = req.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = await req.formData();
      signedRequest = form.get("signed_request") as string | null;
    } else if (contentType.includes("application/json")) {
      // Defensive — some clients (e.g. our own tests) might POST JSON
      const body = await req.json();
      signedRequest = body.signed_request ?? null;
    } else {
      // Try formData anyway — Meta has been known to omit the header
      const form = await req.formData();
      signedRequest = form.get("signed_request") as string | null;
    }
  } catch (e) {
    console.error("Failed to parse request body:", e);
    return new Response("Bad Request", { status: 400, headers: corsHeaders });
  }

  if (!signedRequest) {
    return new Response("Missing signed_request", { status: 400, headers: corsHeaders });
  }

  // Try both app secrets (we run two Meta apps against the same infra)
  const secrets = [
    Deno.env.get("META_APP_SECRET"),
    Deno.env.get("META_APP_SECRET_IG"),
  ].filter((s): s is string => !!s && s.length > 0);

  if (secrets.length === 0) {
    console.error("No META_APP_SECRET* configured — cannot verify signed_request");
    return new Response("Server misconfigured", { status: 500, headers: corsHeaders });
  }

  const verified = await verifyAndParse(signedRequest, secrets);
  if (!verified) {
    console.error("signed_request HMAC verification failed");
    return new Response("Invalid signed_request", { status: 401, headers: corsHeaders });
  }

  const { payload, matchedSecret } = verified;
  const metaUserId = String(payload.user_id || "").trim();
  if (!metaUserId) {
    return new Response("signed_request missing user_id", { status: 400, headers: corsHeaders });
  }

  // Determine which app sent this. We don't truly know without comparing
  // secrets to env names, but the lookup is cheap and useful for debugging.
  const metaAppId =
    matchedSecret === Deno.env.get("META_APP_SECRET_IG")
      ? Deno.env.get("META_APP_ID_IG") ?? "ig"
      : Deno.env.get("META_APP_ID") ?? "fb";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const confirmationCode = randomConfirmationCode();

  // Persist the deletion request synchronously so the status URL is valid
  // even before the deletion finishes.
  const { data: inserted, error: insertErr } = await supabase
    .from("data_deletion_requests")
    .insert({
      confirmation_code: confirmationCode,
      meta_user_id: metaUserId,
      meta_app_id: metaAppId,
      status: "pending",
      raw_signed_request: signedRequest,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    console.error("Failed to record deletion request:", insertErr);
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }

  const requestId = inserted.id as string;

  // Build the public status URL. The frontend route reads the code and
  // surfaces status via the public RPC function.
  const appUrl =
    Deno.env.get("APP_URL") || "https://app.klosify.com";
  const statusUrl = `${appUrl.replace(/\/$/, "")}/data-deletion-status?code=${confirmationCode}`;

  // Fire-and-forget the actual deletion in the background. Meta retries if
  // we don't respond within ~20s, so we MUST return quickly.
  // @ts-ignore — EdgeRuntime is a Supabase Deno deploy global, no types
  (globalThis.EdgeRuntime?.waitUntil ?? ((p: Promise<unknown>) => p))(
    performDeletion(supabase, requestId, metaUserId),
  );

  return new Response(
    JSON.stringify({ url: statusUrl, confirmation_code: confirmationCode }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
  );
});
