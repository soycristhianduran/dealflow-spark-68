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

/**
 * Evaluates an If/Else condition step against the contact.
 * Returns true if the condition passes, false if it fails.
 */
function evaluateCondition(cfg: any, contact: any): boolean {
  const { field = "tags", operator = "contains", value = "" } = cfg;
  let fieldValue: any;

  switch (field) {
    case "tags":
      fieldValue = Array.isArray(contact.tags) ? contact.tags : [];
      break;
    case "primary_email":
      fieldValue = contact.primary_email ?? "";
      break;
    case "lead_status":
    case "status":
      fieldValue = contact.status ?? contact.lead_status ?? "";
      break;
    default:
      fieldValue = contact[field] ?? "";
  }

  switch (operator) {
    case "contains":
      if (Array.isArray(fieldValue)) {
        return fieldValue.some((t: string) => String(t).toLowerCase().includes(String(value).toLowerCase()));
      }
      return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
    case "equals":
      if (Array.isArray(fieldValue)) return fieldValue.includes(value);
      return String(fieldValue).toLowerCase() === String(value).toLowerCase();
    case "not_empty":
      if (Array.isArray(fieldValue)) return fieldValue.length > 0;
      return String(fieldValue).trim().length > 0;
    default:
      return true;
  }
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

    // ── Trigger event: fired by edge functions (landing-submit, track-email, etc.) ──
    if (body.action === "trigger_event") {
      const { trigger_type, contact_id, trigger_data } = body;
      if (!trigger_type || !contact_id) {
        return new Response(JSON.stringify({ error: "trigger_type y contact_id son obligatorios" }), { status: 400, headers: corsHeaders });
      }

      // Resolve contact's organization_id for org-scoped automation lookup
      const { data: contactRow } = await supabase
        .from("contacts")
        .select("organization_id")
        .eq("id", contact_id)
        .maybeSingle();

      const orgId = contactRow?.organization_id;
      if (!orgId) {
        return new Response(JSON.stringify({ error: "contact not found or has no organization" }), { status: 404, headers: corsHeaders });
      }

      // Find active automations with this trigger type IN THIS ORG ONLY
      const { data: automations } = await supabase
        .from("automations")
        .select("id, trigger_type, trigger_config, name, user_id")
        .eq("trigger_type", trigger_type)
        .eq("is_active", true)
        .eq("organization_id", orgId);

      let enrolled = 0;
      for (const automation of (automations || [])) {
        // Check trigger_config conditions
        const cfg = automation.trigger_config || {};
        if (trigger_type === "landing_form_submitted" && cfg.page_id && cfg.page_id !== trigger_data?.landing_slug) continue;
        if (trigger_type === "email_opened"  && cfg.campaign_id && cfg.campaign_id !== trigger_data?.campaign_id) continue;
        if (trigger_type === "email_clicked" && cfg.campaign_id && cfg.campaign_id !== trigger_data?.campaign_id) continue;
        // tag_added: filter by specific tag if configured
        if (trigger_type === "tag_added" && cfg.tag && !((trigger_data?.new_tags || []) as string[]).includes(cfg.tag)) continue;
        // contact_stage_changed: filter by stage_id if stored, fall back to stage_name
        if (trigger_type === "contact_stage_changed") {
          if (cfg.stage_id && cfg.stage_id !== trigger_data?.stage_id) continue;
          if (!cfg.stage_id && cfg.stage_name && cfg.stage_name !== trigger_data?.stage_name) continue;
        }

        // Skip if already active/waiting in this automation
        const { data: existing } = await supabase
          .from("automation_enrollments")
          .select("id")
          .eq("automation_id", automation.id)
          .eq("contact_id", contact_id)
          .in("status", ["active", "waiting"])
          .maybeSingle();
        if (existing) continue;

        const { data: inserted } = await supabase
          .from("automation_enrollments")
          .insert({
            automation_id: automation.id,
            contact_id,
            user_id: automation.user_id,   // required NOT NULL — comes from the automation owner
            status: "active",
            current_step_index: 0,
            next_run_at: new Date().toISOString(),
          })
          .select("*, automations(*), contacts(*)")
          .single();

        if (inserted) {
          try { await processEnrollment(inserted, supabase); } catch (_) {}
          enrolled++;
        }
      }
      return new Response(JSON.stringify({ success: true, enrolled }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
  let extraSkip = 0; // set to 1 by condition step when condition is FALSE (skip next step)
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
      // Look up primary WhatsApp config for this org (multi-number aware)
      const { data: waConfig } = await supabase
        .from("whatsapp_configs")
        .select("phone_number_id, access_token")
        .eq("organization_id", contact.organization_id)
        .eq("is_active", true)
        .neq("phone_number_id", "pending")
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle();

      const cleanPhone = (contact.primary_phone || "").replace(/[^0-9]/g, "");

      if (!waConfig) {
        logs = addLog("WhatsApp no configurado — paso omitido");
      } else if (!cleanPhone) {
        logs = addLog("Contacto sin teléfono válido — paso omitido");
      } else {
        // Check automated message quota before sending
        const { data: hasQuota } = await supabase.rpc("consume_automated_message_quota", {
          p_org_id: contact.organization_id,
          p_amount: 1,
        });
        if (!hasQuota) {
          logs = addLog("Límite de mensajes automatizados alcanzado — paso omitido");
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
          from_phone_number_id: waConfig.phone_number_id,
          direction: "outgoing",
          message_type: "template",
          message_text: msgText,
          status: "sent",
        });

        logs = addLog(`WhatsApp ${cfg.template_name} enviado a ${contact.primary_phone}`);
        } // end hasQuota
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

    else if (step.type === "assign_owner") {
      const { mode, owner_id, owner_name, owner_ids } = step.config || {};

      if (mode === "round_robin" && Array.isArray(owner_ids) && owner_ids.length > 0) {
        // Pick the member with the fewest contacts assigned in this org in the last 30 days
        const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
        const { data: recentContacts } = await supabase
          .from("contacts")
          .select("owner_id")
          .in("owner_id", owner_ids)
          .eq("organization_id", contact.organization_id)
          .gte("updated_at", since);

        const counts: Record<string, number> = {};
        owner_ids.forEach((id: string) => { counts[id] = 0; });
        (recentContacts || []).forEach((r: any) => {
          if (counts[r.owner_id] !== undefined) counts[r.owner_id]++;
        });

        // Assign to the member with the fewest assignments
        const selectedId = (owner_ids as string[]).reduce((min: string, id: string) =>
          counts[id] < counts[min] ? id : min
        );

        await supabase.from("contacts").update({ owner_id: selectedId }).eq("id", contact.id);
        logs = addLog(`Lead asignado (round robin) → ${selectedId} (${counts[selectedId]} asignaciones recientes)`);

      } else if (owner_id) {
        await supabase.from("contacts").update({ owner_id }).eq("id", contact.id);
        logs = addLog(`Lead asignado a ${owner_name || owner_id}`);
      }
    }

    else if (step.type === "remove_tag") {
      const tag = renderVars(step.config?.tag || "", ctx);
      if (tag) {
        const { data: cont } = await supabase.from("contacts").select("tags").eq("id", contact.id).single();
        const updated = (cont?.tags || []).filter((t: string) => t !== tag);
        await supabase.from("contacts").update({ tags: updated }).eq("id", contact.id);
        logs = addLog(`Tag "${tag}" eliminado`);
      }
    }

    else if (step.type === "move_pipeline_stage") {
      const { pipeline_id, stage_id, stage_name } = step.config || {};
      if (pipeline_id && stage_id) {
        // Pipeline is contact-based: update contacts.stage_id + pipeline_id directly
        await supabase.from("contacts").update({
          stage_id,
          pipeline_id,
          lead_status: "active",
        }).eq("id", contact.id);
        logs = addLog(`Lead movido a etapa "${stage_name}" en el pipeline`);
      }
    }

    else if (step.type === "create_task") {
      const { title, due_in_days, assign_to_owner } = step.config || {};
      if (title) {
        const taskTitle = renderVars(title, ctx);
        const dueDate = new Date(Date.now() + (due_in_days || 1) * 86_400_000).toISOString().split("T")[0];
        await supabase.from("tasks").insert({
          title: taskTitle,
          contact_id: contact.id,
          organization_id: contact.organization_id,
          due_date: dueDate,
          status: "pending",
          owner_id: assign_to_owner ? (contact.owner_id || enr.user_id) : enr.user_id,
        });
        logs = addLog(`Tarea creada: "${taskTitle}" vence en ${due_in_days} día(s)`);
      }
    }

    else if (step.type === "condition") {
      const passed = evaluateCondition(step.config || {}, contact);
      if (passed) {
        logs = addLog(`Condición "${step.config?.field} ${step.config?.operator} ${step.config?.value}" → VERDADERA, continúa al siguiente paso`);
      } else {
        extraSkip = 1;
        logs = addLog(`Condición "${step.config?.field} ${step.config?.operator} ${step.config?.value}" → FALSA, se omite el siguiente paso`);
      }
    }

    else if (step.type === "send_webhook") {
      const { url, method = "POST", include_contact } = step.config || {};
      if (url) {
        const payload = include_contact ? {
          event: "automation_step",
          automation_id: enr.automation_id,
          contact: ctx.contact,
          contact_id: contact.id,
          timestamp: new Date().toISOString(),
        } : { event: "automation_step", contact_id: contact.id, timestamp: new Date().toISOString() };

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: method !== "GET" ? JSON.stringify(payload) : undefined,
        });
        logs = addLog(`Webhook enviado a ${url} — status ${res.status}`);
      }
    }

    else if (step.type === "notify_owner") {
      const message = renderVars(step.config?.message || "Nuevo evento en {{contact.name}}", ctx);
      // Get owner's email from auth.users (service role can access this)
      const ownerId = contact.owner_id || enr.user_id;
      if (ownerId) {
        const { data: { user: ownerUser } } = await supabase.auth.admin.getUserById(ownerId);
        const ownerEmail = ownerUser?.email;
        const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
        if (ownerEmail && RESEND_API_KEY) {
          await fetch(`${RESEND_API}/emails`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "Klosify CRM <onboarding@resend.dev>",
              to: [ownerEmail],
              subject: `🔔 Automatización: ${message.slice(0, 60)}`,
              html: `<p>${message}</p><p style="color:#888;font-size:12px">Contacto: ${ctx.contact.name || ctx.contact.email}</p>`,
            }),
          });
          logs = addLog(`Notificación enviada a ${ownerEmail}`);
        } else {
          logs = addLog("Vendedor sin email configurado — notificación omitida");
        }
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

  // Advance to next step (extraSkip=1 when condition was FALSE → skip the next step)
  const nextIndex = stepIndex + 1 + extraSkip;

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
