/**
 * automation-runner — processes pending automation enrollments.
 * Call this every 5 minutes via Supabase cron:
 *   Dashboard → Database → Cron Jobs → "+ New cron job"
 *   Name: automation-runner
 *   Schedule: * /5 * * * *   (every 5 minutes)
 *   HTTP method: POST
 *   URL: https://<project-ref>.supabase.co/functions/v1/automation-runner
 *   Header: Authorization: Bearer <service_role_key>
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";
const RESEND_API = "https://api.resend.com";

function renderVars(template: string, ctx: Record<string, any>): string {
  return template.replace(/\{\{([\w.]+)\}\}/g, (match, path) => {
    const parts = path.split(".");
    let val: any = ctx;
    for (const p of parts) val = val?.[p];
    return val != null ? String(val) : "";
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Auth: called by cron (no auth needed — internal service), or user JWT for manual "enroll" action
  const authHeader = req.headers.get("authorization") || "";
  let userId: string | null = null;

  // Try to resolve a user from the JWT (only needed for the "enroll" action from UI)
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (token !== serviceKey) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) userId = user.id;
    }
  }

  try {
    const bodyText = await req.text();
    const body = bodyText ? JSON.parse(bodyText) : {};

    // Optional: manual enroll from UI (requires user JWT)
    if (body.action === "enroll") {
      const { automation_id, contact_ids } = body;
      if (!automation_id || !contact_ids?.length || !userId) {
        return new Response(JSON.stringify({ error: "automation_id, contact_ids y autenticación son obligatorios" }), { status: 400, headers: corsHeaders });
      }
      const rows = contact_ids.map((cid: string) => ({
        automation_id,
        contact_id: cid,
        user_id: userId,
        status: "active",
        current_step_index: 0,
        next_run_at: new Date().toISOString(),
      }));
      const { data: inserted, error } = await supabase
        .from("automation_enrollments")
        .insert(rows)
        .select("*, automations(*), contacts(*)");
      if (error) throw error;

      // Execute the first step immediately — no need to wait for the cron
      for (const enr of (inserted || [])) {
        try { await processEnrollment(enr, supabase); } catch (e: any) {
          console.error(`Immediate enrollment ${enr.id} failed:`, e.message);
          await supabase.from("automation_enrollments").update({
            status: "failed", error_message: e.message,
          }).eq("id", enr.id);
        }
      }

      return new Response(JSON.stringify({ success: true, enrolled: rows.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ── Main runner: process due enrollments ──────────────────────────────────
    const now = new Date().toISOString();

    const { data: enrollments, error: enrErr } = await supabase
      .from("automation_enrollments")
      .select("*, automations(*), contacts(*)")
      .in("status", ["active", "waiting"])
      .lte("next_run_at", now)
      .limit(50);

    if (enrErr) throw enrErr;

    let processed = 0, completed = 0, errors = 0;

    for (const enr of (enrollments || [])) {
      try {
        await processEnrollment(enr, supabase);
        processed++;
        if (enr.status === "completed") completed++;
      } catch (e: any) {
        console.error(`Enrollment ${enr.id} failed:`, e.message);
        await supabase.from("automation_enrollments").update({
          status: "failed",
          error_message: e.message,
        }).eq("id", enr.id);
        errors++;
      }
    }

    return new Response(JSON.stringify({ processed, completed, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("automation-runner error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

async function processEnrollment(enr: any, supabase: any) {
  const automation = enr.automations;
  const contact = enr.contacts;
  if (!automation || !contact) {
    await supabase.from("automation_enrollments").update({ status: "failed", error_message: "Automation or contact not found" }).eq("id", enr.id);
    return;
  }

  const steps: any[] = automation.steps || [];

  // Skip wait step at current position (we already waited)
  let stepIndex = enr.current_step_index;

  if (stepIndex >= steps.length) {
    await supabase.from("automation_enrollments").update({
      status: "completed", completed_at: new Date().toISOString()
    }).eq("id", enr.id);
    return;
  }

  const step = steps[stepIndex];
  const ctx = {
    contact: {
      first_name: contact.first_name || "",
      last_name: contact.last_name || "",
      name: `${contact.first_name || ""} ${contact.last_name || ""}`.trim(),
      email: contact.primary_email || "",
      phone: contact.primary_phone || "",
      company: contact.company_name || "",
    },
  };

  const addLog = (msg: string) => {
    const logs = enr.logs || [];
    logs.push({ ts: new Date().toISOString(), step: stepIndex, msg });
    return logs;
  };

  // Execute the step
  let logs = enr.logs || [];
  try {
    if (step.type === "wait") {
      // We already waited — just advance
      logs = addLog(`Espera de ${step.config?.delay_value} ${step.config?.delay_unit} completada`);
    }

    else if (step.type === "send_email") {
      const cfg = step.config || {};
      const subject = renderVars(cfg.subject || "", ctx);
      const html = renderVars(cfg.html_content || "", ctx);
      const fromEmail = cfg.from_email || "onboarding@resend.dev";
      const fromName = cfg.from_name || "Equipo";

      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY no configurado");
      if (!contact.primary_email) {
        logs = addLog("Contacto sin email — paso omitido");
      } else {
        const res = await fetch(`${RESEND_API}/emails`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: `${fromName} <${fromEmail}>`,
            to: [contact.primary_email],
            subject,
            html,
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);

        await supabase.from("email_sends").insert({
          automation_enrollment_id: enr.id,
          contact_id: contact.id,
          user_id: enr.user_id,
          email_address: contact.primary_email,
          status: "sent",
          provider_message_id: data.id,
          sent_at: new Date().toISOString(),
        });
        logs = addLog(`Email enviado a ${contact.primary_email}: ${subject}`);
      }
    }

    else if (step.type === "send_whatsapp") {
      const cfg = step.config || {};
      const { data: waConfig } = await supabase
        .from("whatsapp_configs")
        .select("phone_number_id, access_token")
        .eq("user_id", enr.user_id)
        .eq("is_active", true)
        .maybeSingle();

      const cleanPhone = (contact.primary_phone || "").replace(/[^0-9]/g, "");

      if (!waConfig) {
        logs = addLog("WhatsApp no configurado — paso omitido");
      } else if (!cleanPhone) {
        logs = addLog("Contacto sin teléfono válido — paso omitido");
      } else {
        const variables: string[] = (cfg.variables || []).map((v: string) => renderVars(v, ctx));

        // Fetch template metadata (header type + approved media handle)
        const { data: tplMeta } = await supabase
          .from("whatsapp_templates")
          .select("body_text, header_type, header_media_handle")
          .eq("user_id", enr.user_id)
          .eq("name", cfg.template_name)
          .maybeSingle();

        const components: any[] = [];

        // Include header component when the template has a media header.
        // We reuse the handle that was approved with the template — no re-upload needed.
        const headerType: string | null = (tplMeta?.header_type || "").toUpperCase() || null;
        const headerHandle: string | null = tplMeta?.header_media_handle || null;

        if (headerHandle && (headerType === "IMAGE" || headerType === "VIDEO" || headerType === "DOCUMENT")) {
          const mediaKey = headerType === "IMAGE" ? "image"
            : headerType === "VIDEO" ? "video"
            : "document";
          // header_handle values that start with digits are Media Object IDs;
          // values that look like a URL are public links. Support both.
          const isUrl = headerHandle.startsWith("http");
          const mediaObj = isUrl
            ? { link: headerHandle }
            : { id: headerHandle };
          components.push({
            type: "header",
            parameters: [{ type: mediaKey, [mediaKey]: mediaObj }],
          });
        }

        if (variables.length > 0) {
          components.push({ type: "body", parameters: variables.map((v) => ({ type: "text", text: v || " " })) });
        }

        const payload: any = {
          messaging_product: "whatsapp",
          to: cleanPhone,
          type: "template",
          template: {
            name: cfg.template_name,
            language: { code: cfg.language || "es" },
          },
        };
        if (components.length) payload.template.components = components;

        const res = await fetch(`${GRAPH_API}/${waConfig.phone_number_id}/messages`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${waConfig.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);

        // Record in whatsapp_messages (tplMeta already fetched above)

        let msgText = tplMeta?.body_text || `[Plantilla: ${cfg.template_name}]`;
        variables.forEach((v, i) => {
          msgText = msgText.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, "g"), v);
        });

        await supabase.from("whatsapp_messages").insert({
          user_id: enr.user_id,
          contact_id: contact.id,
          wa_message_id: data.messages?.[0]?.id,
          phone_number: contact.primary_phone.replace(/[^0-9]/g, ""),
          direction: "outgoing",
          message_type: "template",
          message_text: msgText,
          status: "sent",
        });

        logs = addLog(`WhatsApp ${cfg.template_name} enviado a ${contact.primary_phone}`);
      }
    }

    else if (step.type === "add_tag") {
      const tag = renderVars(step.config?.tag || "", ctx);
      if (tag) {
        const { data: cont } = await supabase.from("contacts").select("tags").eq("id", contact.id).single();
        const existing: string[] = cont?.tags || [];
        if (!existing.includes(tag)) {
          await supabase.from("contacts").update({ tags: [...existing, tag] }).eq("id", contact.id);
        }
        logs = addLog(`Tag "${tag}" añadido`);
      }
    }

    else if (step.type === "update_contact") {
      const { field, value } = step.config || {};
      if (field && value !== undefined) {
        await supabase.from("contacts").update({ [field]: renderVars(String(value), ctx) }).eq("id", contact.id);
        logs = addLog(`Campo ${field} actualizado`);
      }
    }

    // Log activity
    await supabase.from("activities").insert({
      related_entity_type: "contact",
      related_entity_id: contact.id,
      event_type: "automation",
      event_source: "automation_runner",
      summary: `Automatización "${automation.name}" — paso ${stepIndex + 1}: ${step.type}`,
      created_by: enr.user_id,
    });

  } catch (stepErr: any) {
    logs = addLog(`ERROR en paso ${stepIndex}: ${stepErr.message}`);
    // Continue to next step even on error (don't block the whole enrollment)
  }

  // Advance to next step
  const nextIndex = stepIndex + 1;

  if (nextIndex >= steps.length) {
    await supabase.from("automation_enrollments").update({
      current_step_index: nextIndex,
      status: "completed",
      completed_at: new Date().toISOString(),
      logs,
    }).eq("id", enr.id);
    return;
  }

  const nextStep = steps[nextIndex];
  let nextRunAt = new Date();
  let nextStatus = "active";

  if (nextStep.type === "wait") {
    const { delay_value = 1, delay_unit = "days" } = nextStep.config || {};
    const ms = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 }[delay_unit as string] ?? 86_400_000;
    nextRunAt = new Date(Date.now() + delay_value * ms);
    nextStatus = "waiting";
    logs = addLog(`Esperando ${delay_value} ${delay_unit} hasta ${nextRunAt.toLocaleString()}`);
  }

  await supabase.from("automation_enrollments").update({
    current_step_index: nextIndex,
    next_run_at: nextRunAt.toISOString(),
    status: nextStatus,
    logs,
  }).eq("id", enr.id);
}
