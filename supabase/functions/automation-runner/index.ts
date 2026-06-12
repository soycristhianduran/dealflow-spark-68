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

// Offset (ms) that `timeZone` is ahead of UTC at the given instant.
function tzOffsetMs(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  const hour = m.hour === "24" ? "00" : m.hour;
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +hour, +m.minute, +m.second);
  return asUTC - date.getTime();
}

// Interpret a wall-clock datetime string ("2026-12-25T10:00") as local time in
// `timeZone` and return the corresponding UTC instant.
function zonedWallTimeToUtc(localStr: string, timeZone: string): Date | null {
  const s = localStr.length === 16 ? `${localStr}:00` : localStr;
  const naive = new Date(`${s}Z`); // treat the wall time as if it were UTC
  if (isNaN(naive.getTime())) return null;
  const offset = tzOffsetMs(timeZone, naive);
  return new Date(naive.getTime() - offset);
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

/**
 * Minimal 5-field cron parser: "minute hour dayOfMonth month dayOfWeek"
 * Supports: *, n, *\/n, n,m,...  and n-m ranges.
 * Returns true if the expression fired at any minute between `since` and `now`.
 * Lookback is capped at 1 hour to avoid re-processing old contacts.
 */
function isScheduledDue(cronExpr: string, lastTriggeredAt: string | null, now: Date, timeZone = "America/Bogota"): boolean {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  // Window start: lastTriggeredAt+1min OR 1 hour ago, whichever is more recent
  const oneHourAgo = new Date(now.getTime() - 60 * 60_000);
  const sinceBase = lastTriggeredAt ? new Date(new Date(lastTriggeredAt).getTime() + 60_000) : oneHourAgo;
  const since = sinceBase > oneHourAgo ? sinceBase : oneHourAgo;

  if (since >= now) return false;

  function matchField(field: string, value: number): boolean {
    if (field === "*") return true;
    if (field.startsWith("*/")) {
      const step = parseInt(field.slice(2));
      return !isNaN(step) && value % step === 0;
    }
    if (field.includes(",")) return field.split(",").some(v => parseInt(v.trim()) === value);
    if (field.includes("-")) {
      const [a, b] = field.split("-").map(Number);
      return value >= a && value <= b;
    }
    return parseInt(field) === value;
  }

  // Step through each minute in [since, now]. Cron fields are matched against the
  // wall-clock time in the org's timezone (NOT the server's UTC clock).
  const cursor = new Date(since);
  cursor.setSeconds(0, 0);
  // Advance to next full minute if we landed mid-minute
  if (cursor < since) cursor.setMinutes(cursor.getMinutes() + 1);

  while (cursor <= now) {
    const p = partsInTz(cursor, timeZone);
    if (
      matchField(parts[0], p.minute) &&
      matchField(parts[1], p.hour) &&
      matchField(parts[2], p.day) &&
      matchField(parts[3], p.month) &&
      matchField(parts[4], p.dow)
    ) {
      return true;
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return false;
}

// Calendar date (YYYY-MM-DD) of `date` as seen in a given IANA timezone.
function localDateStr(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

// Add `days` calendar days to a YYYY-MM-DD string.
function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Wall-clock parts of `date` in a given IANA timezone.
function partsInTz(date: Date, timeZone: string): { minute: number; hour: number; day: number; month: number; dow: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false, weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).formatToParts(date);
  const m: Record<string, string> = {};
  for (const x of parts) m[x.type] = x.value;
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    minute: +m.minute,
    hour: m.hour === "24" ? 0 : +m.hour,
    day: +m.day,
    month: +m.month,
    dow: dowMap[m.weekday] ?? 0,
  };
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

      // Find active automations in this org whose trigger set INCLUDES this event.
      // Multi-trigger: an automation can fire on ANY of several triggers (OR logic),
      // stored in `triggers` [{type, config}] / `trigger_types` []. We fetch all
      // active automations for the org (small set) and match in code, falling back
      // to the legacy single trigger_type for rows not yet migrated.
      const { data: allAutomations } = await supabase
        .from("automations")
        .select("id, trigger_type, trigger_config, triggers, name, user_id")
        .eq("is_active", true)
        .eq("organization_id", orgId);

      const automations = (allAutomations || []).filter((a: any) => {
        const types = Array.isArray(a.triggers) && a.triggers.length
          ? a.triggers.map((t: any) => t.type)
          : [a.trigger_type];
        return types.includes(trigger_type);
      });

      let enrolled = 0;
      for (const automation of automations) {
        // Use the config of the MATCHING trigger (multi-trigger), falling back to
        // the legacy single trigger_config.
        const matchTrigger = (Array.isArray(automation.triggers) ? automation.triggers : [])
          .find((t: any) => t.type === trigger_type);
        const cfg = matchTrigger?.config || automation.trigger_config || {};
        // contact_created: filter by creation origin (api, whatsapp, landing,
        // embed_form, meta_lead_form, manual). "any"/empty = all origins.
        if (trigger_type === "contact_created" && cfg.source && cfg.source !== "any"
            && cfg.source !== trigger_data?.origin) continue;
        // meta_lead_form: filter by specific Meta form_id (empty = any form)
        if (trigger_type === "meta_lead_form" && cfg.form_id && cfg.form_id !== trigger_data?.form_id) continue;
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
            organization_id: orgId,
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
      // Resolve org_id from the automation for the enrollment record
      const { data: autoRow } = await supabase.from("automations").select("organization_id, user_id").eq("id", automation_id).maybeSingle();
      const enrollOrgId = autoRow?.organization_id ?? null;
      const rows = contact_ids.map((cid: string) => ({
        automation_id,
        contact_id: cid,
        user_id: userId,
        organization_id: enrollOrgId,
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
      .limit(200);

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

    // ── Scheduled trigger: enroll contacts for due automations ──────────────────
    const nowDate = new Date(now);
    const { data: scheduledAutos } = await supabase
      .from("automations")
      .select("id, name, trigger_config, organization_id, user_id, last_triggered_at")
      .eq("trigger_type", "scheduled")
      .eq("is_active", true);

    let scheduledEnrolled = 0;

    // Cache org timezones so each scheduled automation is evaluated in its own zone.
    const orgTzCache = new Map<string, string>();
    const getOrgTz = async (oid: string | null): Promise<string> => {
      if (!oid) return "America/Bogota";
      if (orgTzCache.has(oid)) return orgTzCache.get(oid)!;
      const { data: org } = await supabase.from("organizations").select("timezone").eq("id", oid).maybeSingle();
      const tz = org?.timezone || "America/Bogota";
      orgTzCache.set(oid, tz);
      return tz;
    };

    for (const auto of (scheduledAutos || [])) {
      const cronExpr: string = (auto.trigger_config?.cron_expression || "").trim();
      if (!cronExpr) continue;
      const orgTz = await getOrgTz(auto.organization_id);
      if (!isScheduledDue(cronExpr, auto.last_triggered_at, nowDate, orgTz)) continue;

      // Stamp last_triggered_at BEFORE enrolling to prevent duplicate runs
      // if this cron tick takes longer than 5 minutes
      await supabase
        .from("automations")
        .update({ last_triggered_at: nowDate.toISOString() })
        .eq("id", auto.id);

      // Fetch contacts in this org (limit 500 per run to stay within timeout)
      const { data: orgContacts } = await supabase
        .from("contacts")
        .select("id")
        .eq("organization_id", auto.organization_id)
        .limit(500);

      for (const c of (orgContacts || [])) {
        // Skip contacts already active or waiting in this automation
        const { data: existing } = await supabase
          .from("automation_enrollments")
          .select("id")
          .eq("automation_id", auto.id)
          .eq("contact_id", c.id)
          .in("status", ["active", "waiting"])
          .maybeSingle();
        if (existing) continue;

        const { data: inserted } = await supabase
          .from("automation_enrollments")
          .insert({
            automation_id: auto.id,
            contact_id: c.id,
            user_id: auto.user_id,
            organization_id: auto.organization_id,
            status: "active",
            current_step_index: 0,
            next_run_at: nowDate.toISOString(),
          })
          .select("*, automations(*), contacts(*)")
          .single();

        if (inserted) {
          try { await processEnrollment(inserted, supabase); } catch (_) {}
          scheduledEnrolled++;
        }
      }
    }

    // ── Date-based triggers (birthday / anniversary / renewal) — daily scan ──
    // For each active automation triggered by a contact date field, find contacts
    // whose date matches today ± offset (in the org timezone) and enroll them.
    // Runs once per org-local day, gated by send_hour, deduped via last_triggered_at.
    let dateEnrolled = 0;
    const { data: allActive } = await supabase
      .from("automations")
      .select("id, name, organization_id, user_id, trigger_type, trigger_config, triggers, last_triggered_at")
      .eq("is_active", true);

    const dateAutos = (allActive || []).filter((a: any) => {
      const types = Array.isArray(a.triggers) && a.triggers.length ? a.triggers.map((t: any) => t.type) : [a.trigger_type];
      return types.includes("contact_date");
    });

    for (const auto of dateAutos) {
      const trig = (Array.isArray(auto.triggers) ? auto.triggers : []).find((t: any) => t.type === "contact_date");
      const cfg = trig?.config || auto.trigger_config || {};
      const field: string = cfg.date_field;
      if (!field) continue;

      const tz = await getOrgTz(auto.organization_id);
      const today = localDateStr(nowDate, tz);                 // YYYY-MM-DD org-local
      const nowHour = partsInTz(nowDate, tz).hour;
      const sendHour = Math.min(23, Math.max(0, Number(cfg.send_hour ?? 9)));

      if (nowHour < sendHour) continue;                        // too early today
      if (auto.last_triggered_at && localDateStr(new Date(auto.last_triggered_at), tz) === today) continue; // already ran today

      // The date value we're looking for among contacts: today shifted opposite to
      // the offset direction (e.g. "3 days before" → match contacts whose date is today+3).
      const off = Number(cfg.offset_value || 0) * (cfg.offset_dir === "after" ? -1 : 1);
      const targetDate = addDaysToDateStr(today, off);         // YYYY-MM-DD
      const targetMMDD = targetDate.slice(5);

      // Fetch candidate contacts. Standard column → filter server-side where possible.
      let q = supabase.from("contacts").select("id, birthday, expected_close_date, custom_fields")
        .eq("organization_id", auto.organization_id).limit(3000);
      const { data: cands } = await q;

      for (const ct of (cands || [])) {
        const raw = field.startsWith("custom:") ? ct.custom_fields?.[field.slice(7)] : ct[field];
        if (!raw) continue;
        const dStr = String(raw).slice(0, 10);
        const matches = cfg.annual ? dStr.slice(5) === targetMMDD : dStr === targetDate;
        if (!matches) continue;

        const { data: existing } = await supabase
          .from("automation_enrollments").select("id")
          .eq("automation_id", auto.id).eq("contact_id", ct.id)
          .in("status", ["active", "waiting"]).maybeSingle();
        if (existing) continue;

        const { data: inserted } = await supabase
          .from("automation_enrollments")
          .insert({
            automation_id: auto.id, contact_id: ct.id, user_id: auto.user_id,
            organization_id: auto.organization_id, status: "active",
            current_step_index: 0, next_run_at: nowDate.toISOString(),
          })
          .select("*, automations(*), contacts(*)").single();
        if (inserted) { try { await processEnrollment(inserted, supabase); } catch (_) {} dateEnrolled++; }
      }

      await supabase.from("automations").update({ last_triggered_at: nowDate.toISOString() }).eq("id", auto.id);
    }

    return new Response(JSON.stringify({ processed, completed, errors, scheduled_enrolled: scheduledEnrolled, date_enrolled: dateEnrolled }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("automation-runner error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

async function processEnrollment(enr: any, supabase: any, depth = 0) {
  // Safety bound: prevents an infinite loop if a condition step jumps backwards.
  if (depth > 50) {
    await supabase.from("automation_enrollments").update({
      status: "completed", completed_at: new Date().toISOString(),
    }).eq("id", enr.id);
    return;
  }
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
  let extraSkip = 0;       // steps to skip when condition is FALSE
  let jumpToIndex: number | null = null; // absolute index to jump to (condition true/false_next_index)
  try {
    if (step.type === "wait") {
      // We already waited — just advance
      logs = addLog(`Espera de ${step.config?.delay_value} ${step.config?.delay_unit} completada`);
    }

    else if (step.type === "send_email") {
      const cfg = step.config || {};
      const subject = renderVars(cfg.subject || "", ctx);
      const html = renderVars(cfg.html_content || "", ctx);
      const fromName = cfg.from_name || "Equipo";
      // Flexible sender: use the org's custom domain only when verified in Resend.
      let fromEmail = Deno.env.get("EMAIL_FROM_ADDRESS") || "onboarding@resend.dev";
      if (cfg.from_email && String(cfg.from_email).includes("@")) {
        const reqDomain = String(cfg.from_email).split("@")[1].toLowerCase();
        const { data: vdom } = await supabase
          .from("email_domains")
          .select("domain")
          .eq("organization_id", contact.organization_id)
          .eq("status", "verified")
          .eq("domain", reqDomain)
          .maybeSingle();
        if (vdom) fromEmail = cfg.from_email;
      }

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

        // Fetch template metadata (header type + approved media handle).
        // Prefer the org-scoped row; fall back to the enrollment owner's rows
        // (legacy templates synced before organization_id was stored) so media
        // headers are still included and the send doesn't fail with #132012.
        let { data: tplMeta } = await supabase
          .from("whatsapp_templates")
          .select("body_text, header_type, header_media_handle")
          .eq("organization_id", contact.organization_id)
          .eq("name", cfg.template_name)
          .maybeSingle();
        if (!tplMeta) {
          const { data: legacyTpl } = await supabase
            .from("whatsapp_templates")
            .select("body_text, header_type, header_media_handle")
            .eq("user_id", enr.user_id)
            .eq("name", cfg.template_name)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          tplMeta = legacyTpl ?? null;
        }

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
      let tag = renderVars(step.config?.tag || "", ctx);
      if (tag) {
        const { data: cont } = await supabase.from("contacts").select("tags, organization_id").eq("id", contact.id).single();
        // Normalize to the catalog's canonical casing (case-insensitive) so we
        // don't create "reserva 54" alongside an existing "Reserva 54". If it's a
        // new tag, register it in the catalog so it shows up in Settings/dropdowns.
        if (cont?.organization_id) {
          const { data: existingTag } = await supabase.from("organization_tags")
            .select("name").eq("organization_id", cont.organization_id).ilike("name", tag).limit(1).maybeSingle();
          if (existingTag?.name) {
            tag = existingTag.name;
          } else {
            await supabase.from("organization_tags").insert({ organization_id: cont.organization_id, name: tag });
          }
        }
        const existing: string[] = cont?.tags || [];
        if (!existing.includes(tag)) {
          await supabase.from("contacts").update({ tags: [...existing, tag] }).eq("id", contact.id);
        }
        logs = addLog(`Tag "${tag}" añadido`);
      }
    }

    else if (step.type === "update_contact") {
      const { field, value } = step.config || {};
      const UPDATE_CONTACT_ALLOWLIST = new Set([
        "first_name", "last_name", "primary_email", "primary_phone", "company_name",
        "city", "country", "notes", "source", "campaign", "language",
        "preferred_channel", "lead_status", "score", "budget", "budget_currency",
        "expected_close_date", "lost_reason", "tags",
      ]);
      if (field && value !== undefined) {
        if (!UPDATE_CONTACT_ALLOWLIST.has(field)) {
          console.warn(`update_contact: field "${field}" is not in the allowlist — skipping`);
          logs = addLog(`Campo "${field}" no permitido — paso omitido`);
        } else {
          await supabase.from("contacts").update({ [field]: renderVars(String(value), ctx) }).eq("id", contact.id);
          logs = addLog(`Campo ${field} actualizado`);
        }
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
        // Compute the due date relative to TODAY in the org's timezone so it lands
        // on the correct calendar day (UTC math drifts a day near local midnight).
        let taskTz = "America/Bogota";
        try {
          const { data: org } = await supabase.from("organizations").select("timezone").eq("id", contact.organization_id).maybeSingle();
          if (org?.timezone) taskTz = org.timezone;
        } catch (_) { /* default */ }
        const dueDate = addDaysToDateStr(localDateStr(new Date(), taskTz), due_in_days || 1);
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
      const cfg = step.config || {};
      const passed = evaluateCondition(cfg, contact);
      if (passed) {
        if (cfg.true_next_index != null) {
          jumpToIndex = Number(cfg.true_next_index);
          logs = addLog(`Condición "${cfg.field} ${cfg.operator} ${cfg.value}" → VERDADERA, saltando al índice ${jumpToIndex}`);
        } else {
          logs = addLog(`Condición "${cfg.field} ${cfg.operator} ${cfg.value}" → VERDADERA, continúa al siguiente paso`);
        }
      } else {
        if (cfg.false_next_index != null) {
          jumpToIndex = Number(cfg.false_next_index);
          logs = addLog(`Condición "${cfg.field} ${cfg.operator} ${cfg.value}" → FALSA, saltando al índice ${jumpToIndex}`);
        } else {
          extraSkip = cfg.false_skip_count ?? 1;
          logs = addLog(`Condición "${cfg.field} ${cfg.operator} ${cfg.value}" → FALSA, se omiten ${extraSkip} paso(s)`);
        }
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
          signal: AbortSignal.timeout(10_000),
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
          const notifyRes = await fetch(`${RESEND_API}/emails`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "Klosify CRM <onboarding@resend.dev>",
              to: [ownerEmail],
              subject: `🔔 Automatización: ${message.slice(0, 60)}`,
              html: `<p>${message}</p><p style="color:#888;font-size:12px">Contacto: ${ctx.contact.name || ctx.contact.email}</p>`,
            }),
          });
          const notifyData = await notifyRes.json();
          if (notifyData.error) console.warn("notify_owner Resend error:", notifyData.error);
          logs = addLog(`Notificación enviada a ${ownerEmail}`);
        } else {
          logs = addLog("Vendedor sin email configurado — notificación omitida");
        }
      }
    }

    else if (step.type === "enroll_automation") {
      const targetId: string | undefined = step.config?.automation_id;
      if (!targetId || targetId === enr.automation_id) {
        logs = addLog("Automatización destino inválida — paso omitido");
      } else {
        // Skip if the contact is already running in the target automation (prevents
        // duplicates and A→B→A loops).
        const { data: existingEnr } = await supabase
          .from("automation_enrollments")
          .select("id")
          .eq("automation_id", targetId)
          .eq("contact_id", contact.id)
          .in("status", ["active", "waiting"])
          .maybeSingle();
        if (existingEnr) {
          logs = addLog("El contacto ya está en la automatización destino — omitido");
        } else {
          const { data: target } = await supabase
            .from("automations")
            .select("id, is_active, organization_id, user_id, name")
            .eq("id", targetId)
            .maybeSingle();
          if (target?.is_active && target.organization_id === contact.organization_id) {
            const { data: ins } = await supabase
              .from("automation_enrollments")
              .insert({
                automation_id: targetId,
                contact_id: contact.id,
                user_id: target.user_id,
                organization_id: contact.organization_id,
                status: "active",
                current_step_index: 0,
                next_run_at: new Date().toISOString(),
              })
              .select("*, automations(*), contacts(*)")
              .single();
            if (ins) { try { await processEnrollment(ins, supabase, depth + 1); } catch (_) { /* non-fatal */ } }
            logs = addLog(`Contacto enviado a la automatización "${target.name}"`);
          } else {
            logs = addLog("Automatización destino no encontrada o inactiva — paso omitido");
          }
        }
      }
    }

    // Log activity
    await supabase.from("activities").insert({
      related_entity_type: "contact",
      related_entity_id: contact.id,
      organization_id: contact.organization_id,
      event_type: "automation",
      event_source: "automation_runner",
      summary: `Automatización "${automation.name}" — paso ${stepIndex + 1}: ${step.type}`,
      created_by: enr.user_id,
    });

  } catch (stepErr: any) {
    logs = addLog(`ERROR en paso ${stepIndex}: ${stepErr.message}`);
    // Continue to next step even on error (don't block the whole enrollment)
  }

  // Advance to next step; jumpToIndex wins over extraSkip (set by condition step)
  const nextIndex = jumpToIndex !== null ? jumpToIndex : stepIndex + 1 + extraSkip;

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
    const wcfg = nextStep.config || {};
    nextStatus = "waiting";

    // Resolve org timezone once (used by date-based wait modes).
    const getTz = async () => {
      try {
        const { data: org } = await supabase
          .from("organizations").select("timezone")
          .eq("id", contact.organization_id).maybeSingle();
        return org?.timezone || "America/Bogota";
      } catch (_) { return "America/Bogota"; }
    };

    if (wcfg.mode === "until_date" && wcfg.until_date) {
      // Wait until a specific calendar date/time, in the org's timezone.
      const tz = await getTz();
      const target = zonedWallTimeToUtc(String(wcfg.until_date), tz) ?? new Date(wcfg.until_date);
      nextRunAt = (!target || isNaN(target.getTime()) || target.getTime() < Date.now())
        ? new Date() : target;
      logs = addLog(`Esperando hasta ${wcfg.until_date} (${tz})`);
    } else if (wcfg.mode === "contact_date" && wcfg.date_field) {
      // Wait until a DATE stored on the contact (e.g. birthday, expected_close_date,
      // or a custom date field prefixed "custom:"), with an optional day offset,
      // a send hour, and an optional "annual" mode (next upcoming month/day).
      const tz = await getTz();
      const field: string = wcfg.date_field;
      const raw = field.startsWith("custom:")
        ? contact.custom_fields?.[field.slice(7)]
        : contact[field];

      if (!raw) {
        nextRunAt = new Date(); // no date on contact → skip the wait
        logs = addLog(`El contacto no tiene fecha en "${field}" — se omite la espera`);
      } else {
        let dateStr = String(raw).slice(0, 10); // YYYY-MM-DD
        if (wcfg.annual) {
          const today = localDateStr(new Date(), tz); // YYYY-MM-DD (org-local)
          const mmdd = dateStr.slice(5); // MM-DD
          let year = +today.slice(0, 4);
          if (`${year}-${mmdd}` < today) year += 1; // already passed this year → next year
          dateStr = `${year}-${mmdd}`;
        }
        const off = Number(wcfg.offset_value || 0) * (wcfg.offset_dir === "before" ? -1 : 1);
        if (off) dateStr = addDaysToDateStr(dateStr, off);
        const hour = Math.min(23, Math.max(0, Number(wcfg.send_hour ?? 9)));
        const target = zonedWallTimeToUtc(`${dateStr}T${String(hour).padStart(2, "0")}:00`, tz);
        nextRunAt = (!target || isNaN(target.getTime()) || target.getTime() < Date.now())
          ? new Date() : target;
        logs = addLog(`Esperando hasta la fecha del contacto: ${dateStr} ${String(hour).padStart(2, "0")}:00 (${tz})`);
      }
    } else {
      const delay_value = wcfg.delay_value ?? 1;
      const delay_unit = wcfg.delay_unit ?? "days";
      const ms = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 }[delay_unit as string] ?? 86_400_000;
      nextRunAt = new Date(Date.now() + delay_value * ms);
      logs = addLog(`Esperando ${delay_value} ${delay_unit} hasta ${nextRunAt.toLocaleString()}`);
    }
  }

  await supabase.from("automation_enrollments").update({
    current_step_index: nextIndex,
    next_run_at: nextRunAt.toISOString(),
    status: nextStatus,
    logs,
  }).eq("id", enr.id);

  // Continue processing immediately when the next step is NOT a timed wait, so
  // back-to-back steps (e.g. add_tag -> send_whatsapp) run in the same pass
  // instead of one-per-cron-tick (up to 5 min apart). Wait steps still pause.
  if (nextStatus === "active" && nextIndex < steps.length) {
    const nextEnr = { ...enr, current_step_index: nextIndex, logs };
    await processEnrollment(nextEnr, supabase, depth + 1);
  }
}
