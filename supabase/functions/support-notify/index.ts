import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * support-notify — sends an email when a support message is posted.
 *  - Client posted (is_staff = false)  → notify soporte@klosify.com.
 *  - Staff posted   (is_staff = true)  → notify the ticket's client.
 * Called fire-and-forget by the app right after inserting a message.
 */
const RESEND_API = "https://api.resend.com/emails";
const FROM = "Klosify Soporte <noreply@klosify.com>";
const SUPPORT_INBOX = "soporte@klosify.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function wrap(title: string, lines: string[], cta: { url: string; label: string }) {
  return `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#F97316;color:#fff;padding:14px 18px;border-radius:12px 12px 0 0;font-weight:700">Klosify · Soporte</div>
    <div style="border:1px solid #eee;border-top:0;border-radius:0 0 12px 12px;padding:20px">
      <h2 style="margin:0 0 12px;font-size:17px;color:#111">${title}</h2>
      ${lines.map((l) => `<p style="margin:0 0 10px;color:#444;font-size:14px;line-height:1.5">${l}</p>`).join("")}
      <a href="${cta.url}" style="display:inline-block;margin-top:8px;background:#F97316;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">${cta.label}</a>
    </div>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { ticket_id } = await req.json().catch(() => ({}));
    if (!ticket_id) return new Response(JSON.stringify({ error: "ticket_id requerido" }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const appUrl = Deno.env.get("APP_URL") || "https://app.klosify.com";

    const { data: ticket } = await supabase.from("support_tickets")
      .select("id, subject, organization_id, created_by, last_notified_support_at, last_notified_client_at, organizations(name, slug)")
      .eq("id", ticket_id).maybeSingle();
    if (!ticket) return new Response(JSON.stringify({ ok: false }), { headers: { ...cors, "Content-Type": "application/json" } });

    const { data: lastMsg } = await supabase.from("support_messages")
      .select("body, is_staff").eq("ticket_id", ticket_id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!lastMsg) return new Response(JSON.stringify({ ok: false }), { headers: { ...cors, "Content-Type": "application/json" } });

    const orgName = (ticket as any).organizations?.name || "una organización";
    const orgSlug = (ticket as any).organizations?.slug || "";
    const excerpt = (lastMsg.body || "").slice(0, 280);

    // Debounce: at most one email per direction per ticket every 5 minutes, so a
    // rapid back-and-forth doesn't flood the inbox (the panel is already realtime).
    const DEBOUNCE_MS = 5 * 60 * 1000;
    const dirCol = lastMsg.is_staff ? "last_notified_client_at" : "last_notified_support_at";
    const lastAt = (ticket as any)[dirCol] ? new Date((ticket as any)[dirCol]).getTime() : 0;
    if (Date.now() - lastAt < DEBOUNCE_MS) {
      return new Response(JSON.stringify({ ok: true, skipped: "debounced" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    let to: string, html: string, subject: string;
    if (lastMsg.is_staff) {
      // Notify the client that support replied.
      const { data: u } = await supabase.auth.admin.getUserById(ticket.created_by);
      to = u?.user?.email ?? "";
      if (!to) return new Response(JSON.stringify({ ok: false }), { headers: { ...cors, "Content-Type": "application/json" } });
      subject = `Respuesta a tu ticket: ${ticket.subject}`;
      html = wrap("Soporte te respondió 💬",
        [`Tu ticket <b>"${ticket.subject}"</b> tiene una nueva respuesta:`, `<i>"${excerpt}"</i>`],
        { url: `${appUrl}/w/${orgSlug}/support`, label: "Ver la respuesta" });
    } else {
      // Notify the support inbox of a new client message.
      to = SUPPORT_INBOX;
      subject = `[Soporte] ${orgName}: ${ticket.subject}`;
      html = wrap("Nuevo mensaje de soporte 🎫",
        [`<b>${orgName}</b> escribió en el ticket <b>"${ticket.subject}"</b>:`, `<i>"${excerpt}"</i>`],
        { url: `${appUrl}/admin/soporte`, label: "Abrir bandeja de soporte" });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (RESEND_API_KEY && to) {
      await fetch(RESEND_API, {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [to], subject, html }),
      });
      await supabase.from("support_tickets").update({ [dirCol]: new Date().toISOString() }).eq("id", ticket_id);
    }
    return new Response(JSON.stringify({ ok: true, to }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
