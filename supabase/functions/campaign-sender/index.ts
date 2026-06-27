// campaign-sender — sends a WhatsApp bulk campaign server-side (now or scheduled).
// Reads the campaign config + its 'pending' whatsapp_sends rows and sends each via
// the Cloud API, resolving personalization tokens per contact. Fixes the old
// browser-side send (which only processed the visible page) and enables scheduling.
//
// Modes:
//   POST {}                 → scan: process every scheduled campaign whose time is due
//   POST { campaign_id }    → process that campaign immediately
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};
const GRAPH_API = "https://graph.facebook.com/v21.0";
const MEDIA_HEADER = ["IMAGE", "VIDEO", "DOCUMENT"];

function resolveTokens(val: string, contact: any): string {
  const full = (contact?.full_name || "").trim();
  const first = full.split(/\s+/)[0] || "";
  return (val || "")
    .replace(/\{\{\s*nombre_completo\s*\}\}/gi, full)
    .replace(/\{\{\s*nombre\s*\}\}/gi, first)
    .replace(/\{\{\s*empresa\s*\}\}/gi, (contact?.company_name || "").trim());
}

async function processCampaign(supabase: any, campaignId: string) {
  const { data: camp } = await supabase
    .from("whatsapp_campaigns")
    .select("id, organization_id, user_id, template_name, language, variables, media_id, status")
    .eq("id", campaignId).maybeSingle();
  if (!camp) return { campaignId, error: "not found" };
  if (camp.status === "sent") return { campaignId, skipped: "already sent" };

  await supabase.from("whatsapp_campaigns").update({ status: "sending", updated_at: new Date().toISOString() }).eq("id", campaignId);

  // WhatsApp config for the org (fallback to the campaign owner).
  let cfgQ = supabase.from("whatsapp_configs").select("phone_number_id, access_token").eq("is_active", true);
  cfgQ = camp.organization_id ? cfgQ.eq("organization_id", camp.organization_id) : cfgQ.eq("user_id", camp.user_id);
  const { data: config } = await cfgQ.maybeSingle();
  if (!config) {
    await supabase.from("whatsapp_campaigns").update({ status: "sent" }).eq("id", campaignId);
    return { campaignId, error: "no whatsapp config" };
  }

  const { data: tpl } = await supabase.from("whatsapp_templates")
    .select("header_type, body_text").eq("user_id", camp.user_id).eq("name", camp.template_name).maybeSingle();
  const headerType = tpl?.header_type || null;
  const rawVars: string[] = Array.isArray(camp.variables) ? camp.variables : [];

  // Pending recipients for this campaign.
  const { data: pending } = await supabase
    .from("whatsapp_sends")
    .select("id, contact_id, phone")
    .eq("campaign_id", campaignId).eq("status", "pending");
  const pendingList = pending || [];

  // Bulk-prefetch ALL contacts in one go (was 1 query per message → huge latency).
  const contactIds = [...new Set(pendingList.map((s: any) => s.contact_id).filter(Boolean))];
  const contactMap = new Map<string, any>();
  for (let i = 0; i < contactIds.length; i += 300) {
    const { data: cs } = await supabase.from("contacts")
      .select("id, full_name, company_name").in("id", contactIds.slice(i, i + 300));
    for (const c of (cs || [])) contactMap.set(c.id, c);
  }

  // Send ONE recipient.
  const sendOne = async (s: any): Promise<"sent" | "failed"> => {
    try {
      const contact = contactMap.get(s.contact_id);
      const vars = rawVars.map((v) => resolveTokens(v, contact));
      const components: any[] = [];
      if (MEDIA_HEADER.includes(headerType) && camp.media_id) {
        components.push({ type: "header", parameters: [{ type: headerType.toLowerCase(), [headerType.toLowerCase()]: { id: camp.media_id } }] });
      }
      if (vars.length > 0) {
        components.push({ type: "body", parameters: vars.map((v) => ({ type: "text", text: v || " " })) });
      }
      const payload: any = {
        messaging_product: "whatsapp", to: s.phone.replace(/[^0-9]/g, ""), type: "template",
        template: { name: camp.template_name, language: { code: camp.language || "es" } },
      };
      if (components.length) payload.template.components = components;

      const res = await fetch(`${GRAPH_API}/${config.phone_number_id}/messages`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${config.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      const waId = data.messages?.[0]?.id || null;
      let body = tpl?.body_text || `[Plantilla: ${camp.template_name}]`;
      vars.forEach((val, i) => { body = body.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, "g"), val || `{{${i + 1}}}`); });

      await supabase.from("whatsapp_sends").update({ status: "sent", wa_message_id: waId, sent_at: new Date().toISOString() }).eq("id", s.id);
      await supabase.from("whatsapp_messages").insert({
        user_id: camp.user_id, organization_id: camp.organization_id, contact_id: s.contact_id,
        wa_message_id: waId, phone_number: s.phone, direction: "outgoing", message_type: "template",
        message_text: body, status: "sent", sent_at: new Date().toISOString(),
      });
      return "sent";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Transient rate-limit → leave it PENDING so it retries next pass (don't burn it).
      if (/130429|131056|133016/.test(msg)) return "retry";
      await supabase.from("whatsapp_sends").update({ status: "failed", error_message: msg }).eq("id", s.id);
      // Number not on WhatsApp / undeliverable / invalid → flag the contact so
      // future campaigns auto-exclude it (learns over time, reduces wasted sends).
      if (/131026|131009|131008|133010/.test(msg) && s.contact_id) {
        await supabase.from("contacts").update({ wa_undeliverable: true }).eq("id", s.contact_id);
      }
      return "failed";
    }
  };

  // Process in PARALLEL batches (concurrency) — was strictly sequential, ~4
  // round-trips per message, so thousands took ages. Respect a time budget so the
  // edge function never times out: if recipients remain when we stop, we DON'T
  // mark the campaign 'sent' — the cron backstop re-invokes and continues.
  // ~20 concurrent ≈ 45-50 msg/sec — safely under WhatsApp's 80 msg/sec API cap,
  // and doesn't strain the DB / edge function. Higher risks rate-limit (130429).
  const CONCURRENCY = 20;
  const TIME_BUDGET_MS = 110_000; // ~110s, safely under the function timeout
  const startedAt = Date.now();
  let sent = 0, failed = 0, processed = 0;
  let timedOut = false;

  for (let i = 0; i < pendingList.length; i += CONCURRENCY) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) { timedOut = true; break; }
    const batch = pendingList.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(sendOne));
    for (const r of results) { if (r === "sent") sent++; else if (r === "failed") failed++; /* retry → stays pending */ }
    processed += batch.length;
    // Heartbeat each batch so the cron sees us active and updates live progress.
    await supabase.from("whatsapp_campaigns").update({ updated_at: new Date().toISOString() }).eq("id", campaignId);
  }

  // If we stopped early (time budget), leave the campaign in 'sending' so the cron
  // continues with the remaining pending recipients on the next run.
  if (timedOut) {
    // Mark stale (older updated_at) so the next cron tick resumes the remaining
    // recipients immediately instead of waiting out the 2-min freshness window.
    await supabase.from("whatsapp_campaigns").update({ updated_at: new Date(Date.now() - 5 * 60_000).toISOString() }).eq("id", campaignId);
    return { campaignId, sent, failed, partial: true };
  }

  // Final counters from the source of truth — use exact COUNT queries, NOT a
  // row fetch. A plain select() is capped at 1000 rows by PostgREST, so for a
  // campaign with >1000 recipients the old code only ever saw the first 1000,
  // found 0 pending among them, and marked the whole campaign 'sent' while
  // thousands of recipients were still pending. Counts are not capped.
  const countByStatus = async (status: string) => {
    const { count } = await supabase
      .from("whatsapp_sends")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", status);
    return count ?? 0;
  };

  const stillPending = await countByStatus("pending");
  // If any recipients are still pending (rate-limited retries or the next batch),
  // DON'T mark the campaign 'sent' — leave it stale so the cron finishes them.
  if (stillPending > 0) {
    await supabase.from("whatsapp_campaigns").update({ updated_at: new Date(Date.now() - 5 * 60_000).toISOString() }).eq("id", campaignId);
    return { campaignId, sent, failed, retryPending: stillPending };
  }

  const failedTotal = await countByStatus("failed");
  const sentTotal = await countByStatus("sent");
  await supabase.from("whatsapp_campaigns").update({
    status: "sent",
    sent_count: sentTotal,
    failed_count: failedTotal,
    sent_at: new Date().toISOString(),
  }).eq("id", campaignId);

  return { campaignId, sent, failed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));

    if (body.campaign_id) {
      const r = await processCampaign(supabase, body.campaign_id);
      return new Response(JSON.stringify(r), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Scan mode: scheduled campaigns whose time has arrived, PLUS any 'sending'
    // campaign (resume one that a synchronous 'send now' left half-done / timed out).
    const nowIso = new Date().toISOString();
    const { data: scheduledDue } = await supabase
      .from("whatsapp_campaigns").select("id")
      .eq("status", "scheduled").lte("scheduled_at", nowIso).limit(20);
    const staleIso = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: resuming } = await supabase
      .from("whatsapp_campaigns").select("id")
      .eq("status", "sending").lt("updated_at", staleIso).limit(20);
    // Recover campaigns stuck in 'queued' (browser died before the queued→sending
    // flip): flip them so the DB trigger fires the actual send. Don't process them
    // here directly (that would re-fire the trigger → double-send).
    const { data: stuckQueued } = await supabase
      .from("whatsapp_campaigns").select("id")
      .eq("status", "queued").lt("updated_at", staleIso).limit(20);
    for (const c of (stuckQueued || [])) {
      await supabase.from("whatsapp_campaigns").update({ status: "sending" }).eq("id", c.id);
    }
    const due = [...(scheduledDue || []), ...(resuming || [])];
    const results = [];
    for (const c of (due || [])) results.push(await processCampaign(supabase, c.id));
    return new Response(JSON.stringify({ processed: results.length, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("campaign-sender error:", e);
    try {
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await supabase.from("error_logs").insert({ source: "campaign-sender", level: "error", message: e instanceof Error ? e.message : String(e) });
    } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), { status: 500, headers: corsHeaders });
  }
});
