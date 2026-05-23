import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API = "https://api.resend.com";

// Simple {{contact.field}} and {{variable}} substitution
function renderVars(template: string, ctx: Record<string, any>): string {
  return template.replace(/\{\{([\w.]+)\}\}/g, (match, path) => {
    const parts = path.split(".");
    let val: any = ctx;
    for (const p of parts) val = val?.[p];
    return val != null ? String(val) : match;
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error("Unauthorized");

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY no configurado. Ve a Supabase → Settings → Edge Functions → Secrets y añade RESEND_API_KEY.");

    const body = await req.json();
    const { action } = body;

    // ── SEND CAMPAIGN ──────────────────────────────────────────────────────────
    if (action === "send_campaign") {
      const { campaign_id } = body;
      if (!campaign_id) throw new Error("campaign_id es obligatorio");

      const { data: campaign, error: campErr } = await supabase
        .from("email_campaigns")
        .select("*")
        .eq("id", campaign_id)
        .eq("user_id", user.id)
        .single();
      if (campErr || !campaign) throw new Error("Campaña no encontrada");
      if (campaign.status === "sent") throw new Error("Esta campaña ya fue enviada");

      // Resolve recipients
      let contactsQuery = supabase
        .from("contacts")
        .select("id, first_name, last_name, email: primary_email, company: company_name")
        .eq("owner_id", user.id)
        .not("primary_email", "is", null)
        .neq("primary_email", "");

      const filter = campaign.recipient_filter as any;
      if (filter?.type === "tag" && filter?.value) {
        contactsQuery = contactsQuery.contains("tags", [filter.value]);
      } else if (filter?.type === "manual" && filter?.contact_ids?.length) {
        contactsQuery = contactsQuery.in("id", filter.contact_ids);
      }

      const { data: contacts, error: cErr } = await contactsQuery.limit(5000);
      if (cErr) throw cErr;
      if (!contacts?.length) throw new Error("No hay contactos con email en esta lista");

      const fromAddress = campaign.from_email
        ? `${campaign.from_name || "Equipo"} <${campaign.from_email}>`
        : `${campaign.from_name || "Equipo"} <onboarding@resend.dev>`;

      // Mark as sending
      await supabase.from("email_campaigns").update({
        status: "sending",
        total_recipients: contacts.length,
        updated_at: new Date().toISOString(),
      }).eq("id", campaign_id);

      let sent = 0, failed = 0;
      const BATCH = 50;

      for (let i = 0; i < contacts.length; i += BATCH) {
        const batch = contacts.slice(i, i + BATCH);
        await Promise.all(batch.map(async (contact) => {
          const ctx = {
            contact: {
              first_name: contact.first_name || "",
              last_name: contact.last_name || "",
              name: `${contact.first_name || ""} ${contact.last_name || ""}`.trim(),
              email: contact.email || "",
              company: contact.company || "",
            },
          };
          const subject = renderVars(campaign.subject, ctx);
          const html = renderVars(campaign.html_content, ctx);

          try {
            const res = await fetch(`${RESEND_API}/emails`, {
              method: "POST",
              headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({ from: fromAddress, to: [contact.email], subject, html }),
            });
            const resData = await res.json();
            if (resData.error || !resData.id) throw new Error(resData.error?.message || "Resend error");

            await supabase.from("email_sends").insert({
              campaign_id,
              contact_id: contact.id,
              user_id: user.id,
              email_address: contact.email,
              status: "sent",
              provider_message_id: resData.id,
              sent_at: new Date().toISOString(),
            });
            sent++;
          } catch (e: any) {
            await supabase.from("email_sends").insert({
              campaign_id,
              contact_id: contact.id,
              user_id: user.id,
              email_address: contact.email,
              status: "failed",
              error_message: e.message,
            });
            failed++;
          }
        }));
      }

      await supabase.from("email_campaigns").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        sent_count: sent,
        failed_count: failed,
        updated_at: new Date().toISOString(),
      }).eq("id", campaign_id);

      return new Response(JSON.stringify({ success: true, sent, failed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SEND SINGLE EMAIL (for automations / blasts) ──────────────────────────
    if (action === "send_single") {
      const { to, subject, html, from_name, from_email, contact_id, enrollment_id, campaign_id } = body;
      if (!to || !subject || !html) throw new Error("to, subject y html son obligatorios");

      const buildFrom = (name: string | undefined, email: string) => {
        if (!name) return email;
        const safe = name.replace(/"/g, "'");
        return `"${safe}" <${email}>`;
      };
      const fromAddress = from_email
        ? buildFrom(from_name, from_email)
        : buildFrom(from_name || "Equipo", "onboarding@resend.dev");

      // Pre-generate send ID so we can embed the tracking pixel before sending
      const sendId = crypto.randomUUID();
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const pixelUrl = `${supabaseUrl}/functions/v1/track-email?sid=${sendId}&t=o`;

      // Inject tracking pixel just before </body>, or append at end
      let finalHtml = html;
      const trackingPixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;position:absolute;left:-9999px" />`;
      if (finalHtml.includes("</body>")) {
        finalHtml = finalHtml.replace("</body>", `${trackingPixel}</body>`);
      } else {
        finalHtml = finalHtml + trackingPixel;
      }

      const res = await fetch(`${RESEND_API}/emails`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromAddress, to: [to], subject, html: finalHtml }),
      });
      const resData = await res.json();
      if (resData.error) throw new Error(resData.error.message);

      await supabase.from("email_sends").insert({
        id: sendId,
        campaign_id: campaign_id || null,
        automation_enrollment_id: enrollment_id || null,
        contact_id: contact_id || null,
        user_id: user.id,
        email_address: to,
        status: "sent",
        provider_message_id: resData.id,
        sent_at: new Date().toISOString(),
      });

      return new Response(JSON.stringify({ success: true, message_id: resData.id, send_id: sendId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── TEST SEND ──────────────────────────────────────────────────────────────
    if (action === "test_send") {
      const { to, subject, html, from_name, from_email } = body;
      if (!to || !subject) throw new Error("to y subject son obligatorios");

      const fromAddress = from_email
        ? `${from_name || "Equipo"} <${from_email}>`
        : `Velocity CRM <onboarding@resend.dev>`;

      const res = await fetch(`${RESEND_API}/emails`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromAddress, to: [to], subject: `[PRUEBA] ${subject}`, html: html || "<p>Test</p>" }),
      });
      const resData = await res.json();
      if (resData.error) throw new Error(resData.error.message);

      return new Response(JSON.stringify({ success: true, message_id: resData.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (e: any) {
    console.error("send-email error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
