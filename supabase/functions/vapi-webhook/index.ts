/**
 * vapi-webhook — receives real-time event webhooks from Vapi.ai.
 *
 * Vapi does NOT send a Supabase JWT, so verify_jwt = false in config.toml.
 * Optionally validates the X-Vapi-Secret header against VAPI_WEBHOOK_SECRET.
 *
 * Event types handled:
 *   call-started / call.started     — mark call in_progress
 *   call-ended   / call.ended       — save transcript, recording, structured data
 *   end-of-call-report              — detailed analysis; takes priority over call-ended
 *
 * After processing a completed call we fire (fire-and-forget):
 *   1. call-analyzer   — AI analysis of the transcript
 *   2. automation-runner trigger_event("call.completed") — trigger follow-up automations
 *
 * Env vars required:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   VAPI_WEBHOOK_SECRET   (optional but recommended)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Vapi does not follow CORS preflight — no CORS needed — but we keep a minimal
// set so browser-based testing (Postman, etc.) works without friction.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-vapi-secret",
};

// ── Supabase admin client ─────────────────────────────────────────────────────
function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// ── Optional: verify Vapi webhook secret ─────────────────────────────────────

function verifyVapiSecret(req: Request): boolean {
  const secret = Deno.env.get("VAPI_WEBHOOK_SECRET");
  if (!secret) return true; // Not configured — skip verification

  const provided = req.headers.get("x-vapi-secret") || req.headers.get("x-webhook-secret");
  return provided === secret;
}

// ── Normalise Vapi payload to a consistent shape ──────────────────────────────
// Vapi can send:
//   { message: { type: "...", call: {...}, ... } }   ← older SDK format
//   { type: "...", call: {...}, ... }                 ← newer flat format

interface NormalisedEvent {
  type: string;
  call: Record<string, any>;
  transcript?: string;
  recordingUrl?: string;
  durationSeconds?: number;
  structuredData?: Record<string, any>;
  summary?: string;
  artifact?: Record<string, any>;
}

function normalisePayload(body: any): NormalisedEvent | null {
  // Flat format (newer)
  if (body.type && (body.call || body.callId)) {
    return {
      type: body.type,
      call: body.call || { id: body.callId },
      transcript: body.transcript ?? body.artifact?.transcript ?? null,
      recordingUrl: body.recordingUrl ?? body.artifact?.recordingUrl ?? null,
      durationSeconds: body.durationSeconds ?? extractDuration(body.call),
      structuredData: body.structuredData ?? body.analysis?.structuredData ?? null,
      summary: body.summary ?? body.analysis?.summary ?? null,
      artifact: body.artifact ?? null,
    };
  }

  // Wrapped format (older)
  if (body.message?.type) {
    const msg = body.message;
    return {
      type: msg.type,
      call: msg.call || {},
      transcript: msg.transcript ?? msg.artifact?.transcript ?? null,
      recordingUrl: msg.recordingUrl ?? msg.artifact?.recordingUrl ?? null,
      durationSeconds: msg.durationSeconds ?? extractDuration(msg.call),
      structuredData: msg.structuredData ?? msg.analysis?.structuredData ?? null,
      summary: msg.summary ?? msg.analysis?.summary ?? null,
      artifact: msg.artifact ?? null,
    };
  }

  return null;
}

function extractDuration(call: any): number | null {
  if (!call) return null;
  // Vapi may report duration as seconds or as start/end timestamps
  if (typeof call.duration === "number") return call.duration;
  if (call.startedAt && call.endedAt) {
    const diff =
      new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime();
    return diff > 0 ? Math.round(diff / 1000) : null;
  }
  return null;
}

// ── Determine final call status ───────────────────────────────────────────────
// A call shorter than 5 seconds almost certainly wasn't answered.
const NO_ANSWER_THRESHOLD_SECONDS = 5;

function resolveCompletionStatus(event: NormalisedEvent): "completed" | "no_answer" | "failed" {
  const endedReason =
    event.call?.endedReason ??
    event.call?.hangupCause ??
    null;

  // Explicit no-answer reasons reported by Vapi / Twilio
  const noAnswerReasons = [
    "no-answer",
    "no_answer",
    "busy",
    "machine_detection_end",
    "voicemail",
    "customer-did-not-answer",
    "customer-did-not-give-microphone-permission",
  ];

  if (endedReason && noAnswerReasons.some((r) => String(endedReason).toLowerCase().includes(r))) {
    return "no_answer";
  }

  const dur = event.durationSeconds;
  if (typeof dur === "number" && dur < NO_ANSWER_THRESHOLD_SECONDS) {
    return "no_answer";
  }

  const failedReasons = ["error", "failed", "pipeline-error"];
  if (endedReason && failedReasons.some((r) => String(endedReason).toLowerCase().includes(r))) {
    return "failed";
  }

  return "completed";
}

// ── Fire-and-forget helper ────────────────────────────────────────────────────

function fireAndForget(url: string, body: Record<string, unknown>): void {
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify(body),
  }).catch((e) => console.warn(`fire-and-forget to ${url} failed:`, e));
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleCallStarted(
  supabase: ReturnType<typeof adminClient>,
  event: NormalisedEvent,
): Promise<void> {
  const vapiCallId = event.call?.id;
  if (!vapiCallId) {
    console.warn("call-started: no call.id in payload");
    return;
  }

  const startedAt = event.call?.startedAt ?? new Date().toISOString();

  const { error } = await supabase
    .from("call_logs")
    .update({ status: "in_progress", started_at: startedAt })
    .eq("vapi_call_id", vapiCallId);

  if (error) {
    console.warn(`call-started: could not update call_log for vapi_call_id=${vapiCallId}:`, error.message);
  } else {
    console.log(`call-started: marked in_progress — vapi_call_id=${vapiCallId}`);
  }
}

async function handleCallEnded(
  supabase: ReturnType<typeof adminClient>,
  event: NormalisedEvent,
): Promise<void> {
  const vapiCallId = event.call?.id;
  if (!vapiCallId) {
    console.warn("call-ended: no call.id in payload");
    return;
  }

  // Resolve the existing call_log row
  const { data: existingLog, error: fetchErr } = await supabase
    .from("call_logs")
    .select("id, campaign_id, contact_id, organization_id, status")
    .eq("vapi_call_id", vapiCallId)
    .maybeSingle();

  if (fetchErr) {
    console.error("call-ended: DB error fetching call_log:", fetchErr.message);
    return;
  }

  if (!existingLog) {
    // Vapi may send end-of-call events for calls not initiated through the CRM
    // (e.g. test calls from the Vapi dashboard). Log a warning and skip gracefully.
    console.warn(`call-ended: no call_log found for vapi_call_id=${vapiCallId}`);
    return;
  }

  const endedAt = event.call?.endedAt ?? new Date().toISOString();
  const duration = event.durationSeconds ?? extractDuration(event.call);
  const finalStatus = resolveCompletionStatus(event);

  // Build the complete transcript string — prefer the flat transcript field;
  // fall back to stitching together the transcript array if present.
  let transcriptText: string | null = event.transcript ?? null;
  let transcriptJson: any = null;

  if (!transcriptText && Array.isArray(event.artifact?.messages)) {
    // Vapi provides messages[] in the artifact with role + content
    const msgs: Array<{ role: string; message?: string; content?: string }> = event.artifact.messages;
    transcriptText = msgs
      .map((m) => `${m.role}: ${m.message || m.content || ""}`)
      .join("\n");
    transcriptJson = msgs;
  }

  // Extract recording URL — can live in multiple places depending on Vapi version
  const recordingUrl =
    event.recordingUrl ??
    event.artifact?.recordingUrl ??
    event.call?.recording?.url ??
    null;

  const updatePayload: Record<string, any> = {
    status: finalStatus,
    ended_at: endedAt,
    duration_seconds: duration,
    recording_url: recordingUrl,
    transcript: transcriptText,
    transcript_json: transcriptJson,
    // analysis field from Vapi (temperature, sentiment etc from their analysis plan)
    analysis: event.call?.analysis ?? null,
    structured_data: event.structuredData ?? null,
    ai_summary: event.summary ?? null,
  };

  const { error: updateErr } = await supabase
    .from("call_logs")
    .update(updatePayload)
    .eq("id", existingLog.id);

  if (updateErr) {
    console.error("call-ended: could not update call_log:", updateErr.message);
    return;
  }

  console.log(
    `call-ended: call_log ${existingLog.id} → status=${finalStatus}, duration=${duration}s, vapi_call_id=${vapiCallId}`,
  );

  // Increment campaign counter + auto-complete when all calls are done
  if (existingLog.campaign_id) {
    const counterColumn = finalStatus === "completed" ? "calls_completed" : "calls_failed";
    const { error: rpcErr } = await supabase.rpc("inc_campaign_counter", {
      p_campaign_id: existingLog.campaign_id,
      p_column: counterColumn,
    });
    if (rpcErr) {
      // Fallback: read-increment-write
      console.warn("inc_campaign_counter RPC failed:", rpcErr.message);
      const { data: campRow } = await supabase
        .from("calling_campaigns")
        .select(counterColumn)
        .eq("id", existingLog.campaign_id)
        .maybeSingle();
      if (campRow) {
        const cur = (campRow as any)[counterColumn] ?? 0;
        await supabase
          .from("calling_campaigns")
          .update({ [counterColumn]: cur + 1 })
          .eq("id", existingLog.campaign_id);
      }
    }

    // Auto-complete campaign when calls_completed + calls_failed >= calls_initiated
    const { data: campStats } = await supabase
      .from("calling_campaigns")
      .select("calls_initiated, calls_completed, calls_failed, status")
      .eq("id", existingLog.campaign_id)
      .maybeSingle();

    if (campStats && campStats.status !== "completed") {
      const done = (campStats.calls_completed ?? 0) + (campStats.calls_failed ?? 0) + 1; // +1 for the current call
      if (done >= (campStats.calls_initiated ?? 0)) {
        await supabase
          .from("calling_campaigns")
          .update({ status: "completed" })
          .eq("id", existingLog.campaign_id);
        console.log(`Campaign ${existingLog.campaign_id} auto-completed: ${done}/${campStats.calls_initiated} calls done`);
      }
    }
  }

  // Only fire downstream processing for real answered calls
  if (finalStatus !== "completed") {
    console.log(`call-ended: status=${finalStatus} — skipping analysis and automations`);
    return;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  // 1. Fire call-analyzer (transcription AI analysis) — fire-and-forget
  if (transcriptText) {
    fireAndForget(`${supabaseUrl}/functions/v1/call-analyzer`, {
      call_log_id: existingLog.id,
    });
    console.log(`call-ended: triggered call-analyzer for call_log ${existingLog.id}`);
  } else {
    console.log(`call-ended: no transcript — skipping call-analyzer`);
  }

  // 2. Trigger automation-runner with call.completed event — fire-and-forget
  if (existingLog.contact_id) {
    fireAndForget(`${supabaseUrl}/functions/v1/automation-runner`, {
      action: "trigger_event",
      trigger_type: "call.completed",
      contact_id: existingLog.contact_id,
      trigger_data: {
        call_log_id: existingLog.id,
        vapi_call_id: vapiCallId,
        duration_seconds: duration,
        status: finalStatus,
        campaign_id: existingLog.campaign_id ?? null,
      },
    });
    console.log(`call-ended: triggered call.completed automation for contact ${existingLog.contact_id}`);
  }
}

// end-of-call-report contains the same info as call-ended but is richer —
// delegate to the same handler since the payload shape overlaps.
async function handleEndOfCallReport(
  supabase: ReturnType<typeof adminClient>,
  event: NormalisedEvent,
): Promise<void> {
  console.log("end-of-call-report received — delegating to handleCallEnded");
  await handleCallEnded(supabase, event);
}

// ── Edge Function entrypoint ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Vapi does not send OPTIONS — but handle it for completeness / browser debugging
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // Optional secret verification — ALWAYS return 200 to Vapi even on failures
  // to prevent Vapi from retrying indefinitely.
  if (!verifyVapiSecret(req)) {
    console.error("Vapi webhook: invalid or missing X-Vapi-Secret header");
    // Intentionally 200 to silence Vapi retries
    return new Response("OK", { status: 200, headers: corsHeaders });
  }

  // Parse body — Vapi sends JSON
  let rawBody: string;
  let body: any;
  try {
    rawBody = await req.text();
    body = JSON.parse(rawBody);
  } catch (e) {
    console.error("Vapi webhook: could not parse body:", e);
    return new Response("OK", { status: 200, headers: corsHeaders });
  }

  const event = normalisePayload(body);

  if (!event) {
    // Unknown payload shape — log and acknowledge
    console.warn("Vapi webhook: unrecognised payload shape:", JSON.stringify(body).substring(0, 300));
    return new Response("OK", { status: 200, headers: corsHeaders });
  }

  const supabase = adminClient();

  // Process the event in the background so we ack Vapi immediately.
  // Vapi has a strict ~10s timeout on webhook responses.
  const work = (async () => {
    try {
      const eventType = (event.type || "").toLowerCase();

      switch (eventType) {
        case "call-started":
        case "call.started":
          await handleCallStarted(supabase, event);
          break;

        case "call-ended":
        case "call.ended":
          await handleCallEnded(supabase, event);
          break;

        case "end-of-call-report":
        case "end_of_call_report":
          await handleEndOfCallReport(supabase, event);
          break;

        default:
          // Vapi sends other event types (transcript chunks, status-update, etc.)
          // We acknowledge them but don't process them.
          console.log(`Vapi webhook: unhandled event type "${event.type}" — ignoring`);
      }
    } catch (err) {
      console.error("Vapi webhook: unhandled error during processing:", err);
    }
  })();

  // Use EdgeRuntime.waitUntil when available so the response is sent immediately
  // while background work continues in the Supabase Edge runtime.
  // @ts-expect-error EdgeRuntime is injected by Supabase, not in Deno types
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    // @ts-expect-error see above
    EdgeRuntime.waitUntil(work);
  } else {
    // In local dev (deno serve) await inline — the 200 still goes out first
    // because the Response was already constructed above.
    await work;
  }

  // Vapi requires a fast 200 — respond before processing finishes.
  return new Response("OK", { status: 200, headers: corsHeaders });
});
