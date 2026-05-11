import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

const STANDARD_COLUMNS = new Set([
  "full_name", "first_name", "last_name", "primary_email", "primary_phone",
  "birthday", "city", "country", "language", "timezone",
  "preferred_channel", "notes", "source", "campaign", "adset", "ad",
  "landing_page", "utm_source", "utm_medium", "utm_campaign", "utm_content",
]);

async function verifySignature(rawBody: string, signatureHeader: string | null, appSecret: string): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = signatureHeader.slice("sha256=".length);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (computed.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

async function processLeadgenChange(
  supabase: any,
  pageId: string,
  change: any,
): Promise<void> {
  const leadgenId = change.value?.leadgen_id;
  const formId = change.value?.form_id;
  if (!leadgenId || !formId) {
    console.warn("Skipping change without leadgen_id/form_id", change);
    return;
  }

  console.log(`Processing leadgen ${leadgenId} (form ${formId}, page ${pageId})`);

  const { data: pageData, error: pageErr } = await supabase
    .from("facebook_pages")
    .select("user_id, page_access_token")
    .eq("page_id", pageId)
    .limit(1)
    .maybeSingle();

  if (pageErr) {
    console.error(`DB error loading page ${pageId}:`, pageErr);
    return;
  }
  if (!pageData) {
    console.error(`No facebook_pages row for page_id=${pageId}; lead dropped`);
    return;
  }

  const { user_id: userId, page_access_token: pageToken } = pageData;

  // Resolve the user's organization_id so contacts/deals are visible under the correct org
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  const organizationId: string | null = membership?.organization_id ?? null;

  const isTestLead = String(leadgenId).startsWith("TEST_");
  let fields: Record<string, string> = {};

  if (isTestLead) {
    console.log("Test lead detected — using placeholder data");
    fields = {
      full_name: "Lead de Prueba",
      first_name: "Lead",
      last_name: "de Prueba",
      email: `test_${Date.now()}@test.com`,
      phone_number: "+0000000000",
    };
  } else {
    const leadRes = await fetch(`${GRAPH_API}/${leadgenId}?access_token=${pageToken}`);
    const leadData = await leadRes.json();
    if (!leadRes.ok) {
      console.error(`Graph API error fetching lead ${leadgenId}:`, JSON.stringify(leadData));
      return;
    }
    for (const fd of leadData.field_data || []) {
      fields[(fd.name || "").toLowerCase()] = (fd.values || [])[0] || "";
    }
  }

  const { data: userMappings } = await supabase
    .from("facebook_field_mappings")
    .select("fb_field_name, contact_field, is_custom_field")
    .eq("user_id", userId)
    .eq("form_id", formId);

  const hasCustomMappings = userMappings && userMappings.length > 0;

  const contactData: Record<string, any> = {
    source: "facebook_ads",
    campaign: change.value?.campaign_name || change.value?.campaign_id || formId,
    adset: change.value?.adset_name || change.value?.adset_id || null,
    ad: change.value?.ad_name || change.value?.ad_id || null,
    status: "new",
    owner_id: userId,
    organization_id: organizationId,
  };
  const customFields: Record<string, string> = {};

  if (hasCustomMappings) {
    for (const mapping of userMappings!) {
      const value = fields[mapping.fb_field_name.toLowerCase()] || "";
      if (!value) continue;
      if (mapping.is_custom_field) {
        customFields[mapping.contact_field] = value;
      } else if (STANDARD_COLUMNS.has(mapping.contact_field)) {
        contactData[mapping.contact_field] = value;
      }
    }
  } else {
    contactData.first_name = fields["first_name"] || fields["nombre"] || null;
    contactData.last_name = fields["last_name"] || fields["apellido"] || fields["apellidos"] || null;
    contactData.primary_email = fields["email"] || fields["correo"] || fields["correo_electrónico"] || null;
    contactData.primary_phone = fields["phone_number"] || fields["telefono"] || fields["teléfono"] || fields["phone"] || fields["número_de_teléfono"] || null;
    contactData.birthday = fields["date_of_birth"] || fields["fecha_de_nacimiento"] || fields["birthday"] || null;
    contactData.city = fields["city"] || fields["ciudad"] || null;
    contactData.country = fields["country"] || fields["país"] || null;

    if (!contactData.first_name) {
      const fullNameRaw = fields["full_name"] || fields["nombre_completo"] || fields["name"] || "";
      if (fullNameRaw) {
        const parts = fullNameRaw.trim().split(/\s+/);
        contactData.first_name = parts[0] || null;
        contactData.last_name = parts.slice(1).join(" ") || null;
      }
    }
  }

  contactData.full_name = [contactData.first_name, contactData.last_name].filter(Boolean).join(" ") || "Lead Facebook";
  if (Object.keys(customFields).length > 0) {
    contactData.custom_fields = customFields;
  }

  let existingContactId: string | null = null;
  if (contactData.primary_email) {
    const { data } = await supabase
      .from("contacts")
      .select("id")
      .eq("primary_email", contactData.primary_email)
      .limit(1)
      .maybeSingle();
    existingContactId = data?.id || null;
  }
  if (!existingContactId && contactData.primary_phone) {
    const { data } = await supabase
      .from("contacts")
      .select("id")
      .eq("primary_phone", contactData.primary_phone)
      .limit(1)
      .maybeSingle();
    existingContactId = data?.id || null;
  }

  if (existingContactId) {
    console.log(`Lead ${leadgenId} already exists as contact ${existingContactId}, skipping`);
    return;
  }

  const { data: newContact, error: contactErr } = await supabase
    .from("contacts")
    .insert(contactData)
    .select("id")
    .single();

  if (contactErr || !newContact) {
    console.error(`Error creating contact from lead ${leadgenId}:`, contactErr);
    return;
  }
  console.log(`Created contact ${newContact.id} from lead ${leadgenId}`);

  const { data: pipeline } = await supabase
    .from("pipelines")
    .select("id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!pipeline) {
    console.warn(`No pipeline configured — contact created without deal (${newContact.id})`);
    return;
  }

  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", pipeline.id)
    .order("order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!stage) {
    console.warn(`Pipeline ${pipeline.id} has no stages — contact created without deal`);
    return;
  }

  const { error: dealErr } = await supabase.from("deals").insert({
    title: `Lead FB - ${contactData.full_name}`,
    contact_id: newContact.id,
    pipeline_id: pipeline.id,
    stage_id: stage.id,
    owner_id: userId,
    organization_id: organizationId,
    value: 0,
    currency: "USD",
    status: "open",
    source: "facebook",
  });
  if (dealErr) {
    console.error(`Error creating deal for contact ${newContact.id}:`, dealErr);
  } else {
    console.log(`Created deal for contact ${newContact.id}`);
  }

  // ── Trigger automations with trigger_type = "meta_lead_form" ────────────────
  try {
    const { data: automations } = await supabase
      .from("automations")
      .select("id, trigger_config")
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("trigger_type", "meta_lead_form");

    const matching = (automations || []).filter((a: any) => {
      const cfg = a.trigger_config || {};
      // Fire if no form_id configured (catch-all) OR form_id matches
      return !cfg.form_id || cfg.form_id === formId;
    });

    if (matching.length > 0) {
      const enrollments = matching.map((a: any) => ({
        automation_id: a.id,
        contact_id: newContact.id,
        user_id: userId,
        status: "active",
        current_step_index: 0,
        next_run_at: new Date().toISOString(),
      }));
      const { data: inserted, error: enrollErr } = await supabase
        .from("automation_enrollments")
        .insert(enrollments)
        .select("*, automations(*), contacts(*)");
      if (enrollErr) {
        console.error("Error enrolling contact in automations:", enrollErr);
      } else {
        console.log(`Enrolled contact ${newContact.id} in ${matching.length} automation(s)`);
        // Fire first step immediately — the automation runner cron is the fallback,
        // but we want instant execution when a lead arrives.
        const runnerUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/automation-runner`;
        fetch(runnerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({}),
        }).catch((e) => console.error("Could not trigger automation-runner:", e));
      }
    }
  } catch (autoErr) {
    // Non-fatal — log and continue
    console.error("Error triggering automations for lead:", autoErr);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ===== GET: Meta Webhook Verification =====
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = (url.searchParams.get("hub.verify_token") || "").trim();
    const challenge = url.searchParams.get("hub.challenge");

    const VERIFY_TOKEN = (Deno.env.get("FB_WEBHOOK_VERIFY_TOKEN") || "").trim();

    if (mode === "subscribe" && token === VERIFY_TOKEN && VERIFY_TOKEN.length > 0) {
      console.log("Webhook verified successfully");
      return new Response(challenge, { status: 200 });
    }
    console.error("Webhook verification failed", { mode, tokenProvided: !!token });
    return new Response("Forbidden", { status: 403 });
  }

  // ===== POST: Incoming webhook events =====
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();

  // ----- Signature validation -----
  const APP_SECRET = Deno.env.get("META_APP_SECRET");
  if (!APP_SECRET) {
    console.error("META_APP_SECRET not configured — rejecting webhook");
    return new Response("Server misconfigured", { status: 500 });
  }
  const signature = req.headers.get("x-hub-signature-256");
  const valid = await verifySignature(rawBody, signature, APP_SECRET);
  if (!valid) {
    console.error("Invalid webhook signature", { signaturePresent: !!signature });
    return new Response("Invalid signature", { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch (e) {
    console.error("Webhook body is not valid JSON", e);
    return new Response("OK", { status: 200 });
  }

  if (body.object !== "page") {
    return new Response("OK", { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Process every leadgen change in the background so we ack Meta immediately.
  // Meta retries if we don't 200 within ~20s; processing leads sequentially
  // (Graph fetch + DB writes) can blow that budget.
  const work = (async () => {
    for (const entry of body.entry || []) {
      const pageId = entry.id;
      for (const change of entry.changes || []) {
        if (change.field !== "leadgen") continue;
        try {
          await processLeadgenChange(supabase, pageId, change);
        } catch (err) {
          console.error("Unhandled error processing leadgen change:", err);
        }
      }
    }
  })();

  // @ts-expect-error EdgeRuntime is provided by the Supabase Edge runtime
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    // @ts-expect-error see above
    EdgeRuntime.waitUntil(work);
  } else {
    // Fallback: await inline (still returns 200 even on internal error)
    await work.catch((err) => console.error("Webhook processing error:", err));
  }

  return new Response("OK", { status: 200, headers: corsHeaders });
});
