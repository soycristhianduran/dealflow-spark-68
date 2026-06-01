/**
 * cron-sync-calls — polls Vapi API to sync status for stuck call_logs.
 *
 * Why this exists:
 *   Vapi webhooks (end-of-call-report) are sometimes not delivered despite the
 *   serverUrl being correctly set in assistant config. This cron function acts as
 *   a reliable fallback: it queries the Vapi API directly for any call_log still
 *   in 'initiated' or 'in_progress' status after 3+ minutes, and updates the DB.
 *
 * Scheduled: every 5 minutes via pg_cron (see migration 20260601100000_cron_sync_calls.sql)
 * Can also be called manually:
 *   curl -X POST https://<project>.supabase.co/functions/v1/cron-sync-calls \
 *     -H "Authorization: Bearer <service_role_key>"
 *
 * Env vars required:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// ── Status helpers ────────────────────────────────────────────────────────────

const NO_ANSWER_REASONS = [
  "no-answer", "no_answer", "busy", "voicemail",
  "machine_detection_end", "customer-did-not-answer",
  "customer-did-not-give-microphone-permission",
  "exceeded-max-duration", "customer-ended-call",
];

const FAILED_REASONS = ["error", "failed", "pipeline-error"];

function resolveStatus(vapiCall: any): "completed" | "no_answer" | "failed" {
  const reason = (vapiCall?.endedReason ?? "").toLowerCase();
  if (reason && NO_ANSWER_REASONS.some((r) => reason.includes(r))) {
    // "customer-ended-call" still means the call happened — treat as completed
    if (reason.includes("customer-ended-call")) return "completed";
    return "no_answer";
  }
  if (reason && FAILED_REASONS.some((r) => reason.includes(r))) {
    return "failed";
  }
  // Duration guard: < 5 s → probably unanswered
  const dur = computeDuration(vapiCall);
  if (typeof dur === "number" && dur < 5) return "no_answer";
  return "completed";
}

function computeDuration(vapiCall: any): number | null {
  if (vapiCall?.startedAt && vapiCall?.endedAt) {
    const diff = new Date(vapiCall.endedAt).getTime() - new Date(vapiCall.startedAt).getTime();
    return diff > 0 ? Math.round(diff / 1000) : null;
  }
  return null;
}

function extractTranscript(vapiCall: any): { text: string | null; json: any } {
  // Vapi may provide transcript as a flat string or as messages[]
  if (typeof vapiCall?.transcript === "string" && vapiCall.transcript.trim()) {
    return { text: vapiCall.transcript, json: null };
  }
  if (typeof vapiCall?.artifact?.transcript === "string" && vapiCall.artifact.transcript.trim()) {
    return { text: vapiCall.artifact.transcript, json: null };
  }
  if (Array.isArray(vapiCall?.artifact?.messages)) {
    const msgs = vapiCall.artifact.messages as Array<{ role: string; message?: string; content?: string }>;
    const text = msgs.map((m) => `${m.role}: ${m.message || m.content || ""}`).join("\n");
    return { text: text || null, json: msgs };
  }
  return { text: null, json: null };
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

// ── Main sync logic ───────────────────────────────────────────────────────────

async function syncStuckCalls(): Promise<{ synced: number; errors: number; skipped: number }> {
  const supabase = adminClient();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  // Find all call_logs stuck in initiated/in_progress for > 3 minutes
  const cutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();

  const { data: stuckCalls, error: fetchErr } = await supabase
    .from("call_logs")
    .select("id, vapi_call_id, organization_id, campaign_id, contact_id, status, created_at")
    .in("status", ["initiated", "in_progress"])
    .lt("created_at", cutoff)
    .not("vapi_call_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(50); // process at most 50 per run to stay within execution limits

  if (fetchErr) {
    console.error("cron-sync-calls: failed to fetch stuck calls:", fetchErr.message);
    return { synced: 0, errors: 1, skipped: 0 };
  }

  if (!stuckCalls || stuckCalls.length === 0) {
    console.log("cron-sync-calls: no stuck calls found");
    return { synced: 0, errors: 0, skipped: 0 };
  }

  console.log(`cron-sync-calls: found ${stuckCalls.length} stuck call(s)`);

  // Build a map of org → Vapi API key (avoid duplicate lookups)
  const vapiKeyCache: Record<string, string | null> = {};

  async function getVapiKey(orgId: string): Promise<string | null> {
    if (orgId in vapiKeyCache) return vapiKeyCache[orgId];
    const { data: cfg } = await supabase
      .from("vapi_configs")
      .select("api_key")
      .eq("organization_id", orgId)
      .maybeSingle();
    vapiKeyCache[orgId] = cfg?.api_key ?? null;
    return vapiKeyCache[orgId];
  }

  let synced = 0;
  let errors = 0;
  let skipped = 0;

  for (const callLog of stuckCalls) {
    const { id: logId, vapi_call_id: vapiCallId, organization_id: orgId } = callLog;

    if (!vapiCallId) { skipped++; continue; }

    // Get the Vapi API key for this org
    const apiKey = await getVapiKey(orgId);
    if (!apiKey) {
      console.warn(`cron-sync-calls: no vapi_config for org ${orgId} — skipping call_log ${logId}`);
      skipped++;
      continue;
    }

    // Fetch call status from Vapi API
    let vapiCall: any;
    try {
      const resp = await fetch(`https://api.vapi.ai/call/${vapiCallId}`, {
        headers: { "Authorization": `Bearer ${apiKey}` },
      });

      if (!resp.ok) {
        const body = await resp.text();
        console.warn(`cron-sync-calls: Vapi API ${resp.status} for call ${vapiCallId}: ${body}`);
        errors++;
        continue;
      }

      vapiCall = await resp.json();
    } catch (e) {
      console.error(`cron-sync-calls: network error fetching call ${vapiCallId}:`, e);
      errors++;
      continue;
    }

    // Only process calls that Vapi considers ended
    if (vapiCall?.status !== "ended") {
      console.log(`cron-sync-calls: call ${vapiCallId} still active (status=${vapiCall?.status}) — skipping`);
      skipped++;
      continue;
    }

    // Build update payload mirroring what vapi-webhook does
    const finalStatus = resolveStatus(vapiCall);
    const duration = computeDuration(vapiCall);
    const { text: transcriptText, json: transcriptJson } = extractTranscript(vapiCall);

    const recordingUrl =
      vapiCall?.recordingUrl ??
      vapiCall?.artifact?.recordingUrl ??
      vapiCall?.recording?.url ??
      null;

    const summary =
      vapiCall?.analysis?.summary ??
      vapiCall?.summary ??
      null;

    const updatePayload: Record<string, any> = {
      status: finalStatus,
      ended_at: vapiCall.endedAt ?? new Date().toISOString(),
      duration_seconds: duration,
      recording_url: recordingUrl,
      transcript: transcriptText,
      transcript_json: transcriptJson,
      analysis: vapiCall?.analysis ?? null,
      structured_data: vapiCall?.analysis?.structuredData ?? null,
      ai_summary: summary,
    };

    const { error: updateErr } = await supabase
      .from("call_logs")
      .update(updatePayload)
      .eq("id", logId);

    if (updateErr) {
      console.error(`cron-sync-calls: failed to update call_log ${logId}:`, updateErr.message);
      errors++;
      continue;
    }

    console.log(
      `cron-sync-calls: synced call_log ${logId} → status=${finalStatus}, ` +
      `duration=${duration}s, has_transcript=${!!transcriptText}, vapi_call_id=${vapiCallId}`,
    );
    synced++;

    // Write an activity record so the contact timeline shows the call
    if (callLog.contact_id && callLog.organization_id) {
      const statusLabel: Record<string, string> = {
        completed: "Completada", no_answer: "Sin respuesta", failed: "Fallida",
      };
      const min = duration != null ? Math.floor(duration / 60) : null;
      const sec = duration != null ? String(duration % 60).padStart(2, "0") : null;
      const dur = min != null ? ` · ${min}:${sec}` : "";
      const summaryText = summary ? ` — ${summary}` : "";
      await supabase.from("activities").insert({
        related_entity_type: "contact",
        related_entity_id: callLog.contact_id,
        event_type: "call",
        event_source: "vapi_cron",
        summary: `📞 Llamada IA${dur} · ${statusLabel[finalStatus] ?? finalStatus}${summaryText}`,
        organization_id: callLog.organization_id,
      }).then(({ error: actErr }) => {
        if (actErr) console.warn(`cron-sync-calls: could not insert activity for call_log ${logId}:`, actErr.message);
      });
    }

    // Update campaign counters (same logic as vapi-webhook)
    if (callLog.campaign_id) {
      const counterColumn = finalStatus === "completed" ? "calls_completed" : "calls_failed";
      const { error: rpcErr } = await supabase.rpc("inc_campaign_counter", {
        p_campaign_id: callLog.campaign_id,
        p_column: counterColumn,
      });
      if (rpcErr) {
        // Fallback: direct update
        const { data: campRow } = await supabase
          .from("calling_campaigns")
          .select(counterColumn)
          .eq("id", callLog.campaign_id)
          .maybeSingle();
        if (campRow) {
          const cur = (campRow as any)[counterColumn] ?? 0;
          await supabase.from("calling_campaigns").update({ [counterColumn]: cur + 1 }).eq("id", callLog.campaign_id);
        }
      }

      // Auto-complete campaign when all calls are done
      const { data: campStats } = await supabase
        .from("calling_campaigns")
        .select("calls_initiated, calls_completed, calls_failed, status")
        .eq("id", callLog.campaign_id)
        .maybeSingle();

      if (campStats && campStats.status !== "completed") {
        const done = (campStats.calls_completed ?? 0) + (campStats.calls_failed ?? 0) + 1;
        if (done >= (campStats.calls_initiated ?? 0)) {
          await supabase.from("calling_campaigns").update({ status: "completed" }).eq("id", callLog.campaign_id);
          console.log(`cron-sync-calls: campaign ${callLog.campaign_id} auto-completed`);
        }
      }
    }

    // Fire downstream analysis & automations for real answered calls
    if (finalStatus === "completed") {
      if (transcriptText) {
        fireAndForget(`${supabaseUrl}/functions/v1/call-analyzer`, {
          call_log_id: logId,
        });
      }
      if (callLog.contact_id) {
        fireAndForget(`${supabaseUrl}/functions/v1/automation-runner`, {
          action: "trigger_event",
          trigger_type: "call.completed",
          contact_id: callLog.contact_id,
          trigger_data: {
            call_log_id: logId,
            vapi_call_id: vapiCallId,
            duration_seconds: duration,
            status: finalStatus,
            campaign_id: callLog.campaign_id ?? null,
          },
        });
      }
    }
  }

  return { synced, errors, skipped };
}

// ── HTTP handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: accept service_role key, any valid Supabase JWT, or no token at all.
  // pg_net (cron) sends no auth header; manual calls from the dashboard send service_role.
  // This function only writes back to the DB and never returns sensitive data,
  // so open access is acceptable — the worst an attacker can do is trigger a sync.
  // (The actual DB writes are authenticated with the service_role key internally.)

  try {
    const result = await syncStuckCalls();
    console.log(`cron-sync-calls done: ${JSON.stringify(result)}`);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("cron-sync-calls: unhandled error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
