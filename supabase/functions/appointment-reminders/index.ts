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

  // Orgs that have reminders enabled. Each org has a `reminders` array of
  // { minutes, template, lang }. Fall back to the legacy offsets+single-template.
  const { data: cfgs } = await supabase.from("ai_agent_configs")
    .select("organization_id, reminders, reminder_template_name, reminder_template_lang, reminder_offsets").eq("reminders_enabled", true);

  // Normalize each org's reminders into [{minutes, template, lang}]
  const norm = (c: any): { minutes: number; template: string | null; lang: string }[] => {
    if (Array.isArray(c.reminders) && c.reminders.length) {
      return c.reminders
        .map((r: any) => ({ minutes: Number(r.minutes), template: r.template || null, lang: r.lang || "es" }))
        .filter((r: any) => r.minutes > 0);
    }
    return (c.reminder_offsets || [])
      .map((n: number) => ({ minutes: Number(n), template: c.reminder_template_name || null, lang: c.reminder_template_lang || "es" }))
      .filter((r: any) => r.minutes > 0);
  };
  const orgCfg = new Map((cfgs || []).map((c: any) => [c.organization_id, norm(c)]));
  for (const [k, v] of [...orgCfg]) if (!v.length) orgCfg.delete(k);
  if (!orgCfg.size) return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: { "Content-Type": "application/json" } });

  const now = Date.now();
  const maxOffsetMin = Math.max(60, ...[...orgCfg.values()].flatMap((rs) => rs.map((r) => r.minutes)));
  const horizon = new Date(now + (maxOffsetMin + 30) * 60_000).toISOString();

  // Cache one active WhatsApp config per org
  const waCache = new Map<string, any>();
  const getWa = async (orgId: string) => {
    if (waCache.has(orgId)) return waCache.get(orgId);
    const { data } = await supabase.from("whatsapp_configs")
      .select("phone_number_id, access_token").eq("organization_id", orgId).eq("is_active", true).limit(1).maybeSingle();
    waCache.set(orgId, data || null);
    return data || null;
  };

  // All upcoming scheduled meetings for enabled orgs, within the largest offset
  const { data: meetings } = await supabase.from("meetings")
    .select("id, title, start_at, organization_id, location_or_link, meeting_type, reminders_sent, contacts(full_name, primary_phone)")
    .eq("status", "scheduled")
    .gt("start_at", new Date(now).toISOString())
    .lt("start_at", horizon)
    .in("organization_id", [...orgCfg.keys()])
    .limit(500);

  let sent = 0;

  for (const mtg of meetings || []) {
    const reminders = orgCfg.get(mtg.organization_id) || [];
    if (!reminders.length) continue;
    const alreadySent: number[] = Array.isArray(mtg.reminders_sent) ? mtg.reminders_sent : [];
    const startMs = new Date(mtg.start_at).getTime();

    // Which reminders are due now and not yet sent (dedup by minutes)?
    const due = reminders.filter(r => !alreadySent.includes(r.minutes) && now >= startMs - r.minutes * 60_000);
    if (!due.length) continue;

    const phone = mtg.contacts?.primary_phone;
    const wa = await getWa(mtg.organization_id);

    for (const r of due) {
      if (phone && wa) {
        const name = (mtg.contacts?.full_name || "").split(" ")[0] || "Cliente";
        const place = mtg.meeting_type === "in_person"
          ? (mtg.location_or_link ? `\n📍 Dirección: ${mtg.location_or_link}` : "")
          : (mtg.location_or_link ? `\n🎥 Enlace: ${mtg.location_or_link}` : "");
        const whenStr = fmtTime(mtg.start_at);
        let err: string | null;
        if (r.template) {
          err = await sendWaTemplate(wa, phone, r.template, r.lang || "es", [name, mtg.title || "tu cita", whenStr]);
        } else {
          const text = `Hola ${name} 👋\nTe recordamos tu cita: *${mtg.title}* — ${whenStr}.${place}\n\n¿Confirmas tu asistencia?`;
          err = await sendWaText(wa, phone, text);
        }
        if (err) {
          await supabase.from("error_logs").insert({
            organization_id: mtg.organization_id, source: "appointment-reminders",
            message: `Reminder (${r.minutes}min) failed for meeting ${mtg.id}: ${err}`,
          }).then(() => {}, () => {});
        } else { sent++; }
      }
      alreadySent.push(r.minutes);
    }
    await supabase.from("meetings").update({ reminders_sent: alreadySent }).eq("id", mtg.id);
  }

  return new Response(JSON.stringify({ ok: true, sent }), { headers: { "Content-Type": "application/json" } });
});
