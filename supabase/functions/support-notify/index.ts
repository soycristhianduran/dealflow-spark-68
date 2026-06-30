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
    const { ticket_id, event = "message" } = await req.json().catch(() => ({}));
    if (!ticket_id) return new Response(JSON.stringify({ error: "ticket_id requerido" }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const appUrl = Deno.env.get("APP_URL") || "https://app.klosify.com";
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    const { data: ticket } = await supabase.from("support_tickets")
      .select("id, subject, status, organization_id, created_by, organizations(name, slug)")
      .eq("id", ticket_id).maybeSingle();
    if (!ticket) return new Response(JSON.stringify({ ok: false }), { headers: { ...cors, "Content-Type": "application/json" } });

    const orgName = (ticket as any).organizations?.name || "una organización";
    const orgSlug = (ticket as any).organizations?.slug || "";
    const send = async (to: string, subject: string, html: string) => {
      if (RESEND_API_KEY && to) {
        await fetch(RESEND_API, {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: FROM, to: [to], subject, html }),
        });
      }
      return to;
    };
    const clientEmail = async () => {
      const { data: u } = await supabase.auth.admin.getUserById(ticket.created_by);
      return u?.user?.email ?? "";
    };

    // ── Status change → notify the client ───────────────────────────────────
    if (event === "status") {
      const LBL: Record<string, string> = { open: "Abierto", in_progress: "En proceso", resolved: "Resuelto", closed: "Cerrado" };
      const to = await clientEmail();
      const status = LBL[ticket.status] ?? ticket.status;
      await send(to, `Tu ticket "${ticket.subject}" ahora está: ${status}`,
        wrap(`Tu ticket cambió de estado → ${status} 🔔`,
          [`El estado de tu ticket <b>"${ticket.subject}"</b> es ahora <b>${status}</b>.`],
          { url: `${appUrl}/w/${orgSlug}/support`, label: "Ver el ticket" }));
      return new Response(JSON.stringify({ ok: true, to, kind: "status" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ── New message ─────────────────────────────────────────────────────────
    // Email ONLY for the FIRST message of a ticket (new ticket → support inbox).
    // Staff replies and follow-up client replies are surfaced in-app (Klofy
    // bubble + realtime panels), not by email.
    const { data: lastMsg } = await supabase.from("support_messages")
      .select("body, is_staff").eq("ticket_id", ticket_id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!lastMsg || lastMsg.is_staff) return new Response(JSON.stringify({ ok: true, skipped: "in_app" }), { headers: { ...cors, "Content-Type": "application/json" } });

    const { count } = await supabase.from("support_messages")
      .select("id", { count: "exact", head: true }).eq("ticket_id", ticket_id);
    if ((count ?? 0) > 1) return new Response(JSON.stringify({ ok: true, skipped: "not_first" }), { headers: { ...cors, "Content-Type": "application/json" } });

    const excerpt = (lastMsg.body || "").slice(0, 280);
    const to = await send(SUPPORT_INBOX, `[Soporte] ${orgName}: ${ticket.subject}`,
      wrap("Nuevo ticket de soporte 🎫",
        [`<b>${orgName}</b> abrió el ticket <b>"${ticket.subject}"</b>:`, `<i>"${excerpt}"</i>`],
        { url: `${appUrl}/admin/soporte`, label: "Abrir bandeja de soporte" }));
    return new Response(JSON.stringify({ ok: true, to, kind: "new_ticket" }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
