import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Appointment reminders — sends WhatsApp reminders to clients before their
 * meeting (one ~24h before, one ~1h before). Runs from a pg_cron job.
 *
 * NOTE: WhatsApp only allows free-form messages within 24h of the customer's
 * last message. Reminders outside that window require an approved template.
 * This sends free-form text (works when the chat is recent) and logs failures;
 * the meeting is marked as reminded either way to avoid spamming.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH_API = "https://graph.facebook.com/v21.0";

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "long", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(iso));
}

// Free-form text (only works within the 24h customer-service window).
async function sendWaText(config: any, phone: string, text: string): Promise<string | null> {
  const to = phone.replace(/[^0-9]/g, "");
  const res = await fetch(`${GRAPH_API}/${config.phone_number_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
  });
  const data = await res.json();
  return data.error ? `Meta ${data.error.code}: ${data.error.message}` : null;
}

// Approved template (works ANY time, even outside the 24h window).
// The business's template must have 3 body variables in this order:
//   {{1}} = nombre, {{2}} = título de la cita, {{3}} = fecha y hora.
async function sendWaTemplate(config: any, phone: string, templateName: string, lang: string, params: string[]): Promise<string | null> {
  const to = phone.replace(/[^0-9]/g, "");
  const res = await fetch(`${GRAPH_API}/${config.phone_number_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to, type: "template",
      template: {
        name: templateName,
        language: { code: lang || "es" },
        components: [{ type: "body", parameters: params.map((t) => ({ type: "text", text: t })) }],
      },
    }),
  });
  const data = await res.json();
  return data.error ? `Meta ${data.error.code}: ${data.error.message}` : null;
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Orgs that have reminders enabled (+ their optional approved template)
  const { data: cfgs } = await supabase.from("ai_agent_configs")
    .select("organization_id, reminder_template_name, reminder_template_lang").eq("reminders_enabled", true);
  const orgCfg = new Map((cfgs || []).map((c: any) => [c.organization_id, c]));
  const enabledOrgs = new Set((cfgs || []).map((c: any) => c.organization_id));
  if (!enabledOrgs.size) return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: { "Content-Type": "application/json" } });

  const nowIso = new Date().toISOString();
  const in24h = new Date(Date.now() + 24 * 3600_000).toISOString();
  const in1h = new Date(Date.now() + 3600_000).toISOString();
  const in2h = new Date(Date.now() + 2 * 3600_000).toISOString();

  // Cache one active WhatsApp config per org
  const waCache = new Map<string, any>();
  const getWa = async (orgId: string) => {
    if (waCache.has(orgId)) return waCache.get(orgId);
    const { data } = await supabase.from("whatsapp_configs")
      .select("phone_number_id, access_token").eq("organization_id", orgId).eq("is_active", true).limit(1).maybeSingle();
    waCache.set(orgId, data || null);
    return data || null;
  };

  let sent = 0;

  // ── 24h reminders: meeting enters the 24h window (and is >2h away) ──────────
  const { data: m24 } = await supabase.from("meetings")
    .select("id, title, start_at, organization_id, location_or_link, meeting_type, contacts(full_name, primary_phone)")
    .eq("status", "scheduled").eq("reminder_24h_sent", false)
    .lte("start_at", in24h).gt("start_at", in2h).limit(200);

  // ── 1h reminders: meeting within the next hour ─────────────────────────────
  const { data: m1 } = await supabase.from("meetings")
    .select("id, title, start_at, organization_id, location_or_link, meeting_type, contacts(full_name, primary_phone)")
    .eq("status", "scheduled").eq("reminder_1h_sent", false)
    .lte("start_at", in1h).gt("start_at", nowIso).limit(200);

  const process = async (rows: any[], kind: "24h" | "1h") => {
    for (const mtg of rows || []) {
      const col = kind === "24h" ? "reminder_24h_sent" : "reminder_1h_sent";
      if (!enabledOrgs.has(mtg.organization_id)) { await supabase.from("meetings").update({ [col]: true }).eq("id", mtg.id); continue; }
      const phone = mtg.contacts?.primary_phone;
      const wa = await getWa(mtg.organization_id);
      if (!phone || !wa) { await supabase.from("meetings").update({ [col]: true }).eq("id", mtg.id); continue; }

      const name = (mtg.contacts?.full_name || "").split(" ")[0] || "Cliente";
      const place = mtg.meeting_type === "in_person"
        ? (mtg.location_or_link ? `\n📍 Dirección: ${mtg.location_or_link}` : "")
        : (mtg.location_or_link ? `\n🎥 Enlace: ${mtg.location_or_link}` : "");
      const lead = kind === "1h" ? "Te recordamos que tu cita es en aproximadamente 1 hora" : "Te recordamos tu cita";
      const whenStr = fmtTime(mtg.start_at);

      // Prefer the approved template (works outside the 24h window). Fall back
      // to free-form text if no template is configured (only works in-window).
      const cfg = orgCfg.get(mtg.organization_id);
      let err: string | null;
      if (cfg?.reminder_template_name) {
        err = await sendWaTemplate(wa, phone, cfg.reminder_template_name, cfg.reminder_template_lang || "es",
          [name, mtg.title || "tu cita", whenStr]);
      } else {
        const text = `Hola ${name} 👋\n${lead}: *${mtg.title}* — ${whenStr}.${place}\n\n¿Confirmas tu asistencia?`;
        err = await sendWaText(wa, phone, text);
      }
      if (err) {
        await supabase.from("error_logs").insert({
          organization_id: mtg.organization_id, source: "appointment-reminders",
          message: `Reminder ${kind} failed for meeting ${mtg.id}: ${err}`,
        }).then(() => {}, () => {});
      } else { sent++; }
      await supabase.from("meetings").update({ [col]: true }).eq("id", mtg.id);
    }
  };

  await process(m24 || [], "24h");
  await process(m1 || [], "1h");

  return new Response(JSON.stringify({ ok: true, sent }), { headers: { "Content-Type": "application/json" } });
});
