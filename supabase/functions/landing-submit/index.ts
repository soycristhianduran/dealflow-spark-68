import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public edge function — no JWT required
// Handles lead form submissions from published landing pages

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Accept both JSON (fetch) and URL-encoded (native HTML form POST)
    const contentType = req.headers.get("content-type") || "";
    let body: Record<string, any>;
    if (contentType.includes("application/json")) {
      body = await req.json();
    } else if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      const fd = await req.formData();
      body = {};
      fd.forEach((v, k) => { body[k] = v; });
    } else {
      // Fallback: try JSON, then URL-encoded plain text
      const text = await req.text();
      try { body = JSON.parse(text); }
      catch { body = Object.fromEntries(new URLSearchParams(text)); }
    }

    const { page_id } = body;

    if (!page_id) throw new Error("page_id is required");

    // Look up the landing page (including form_config and funnel_id for redirect fallback)
    const { data: page, error: pageErr } = await supabase
      .from("landing_pages")
      .select("id, organization_id, name, status, form_config, funnel_id")
      .eq("id", page_id)
      .maybeSingle();

    if (pageErr || !page || page.status !== "published") {
      throw new Error("Landing page not found or not published");
    }

    const orgId = page.organization_id;
    const formConfig: Record<string, any> = (page.form_config as any) || {};
    const configFields: any[] = formConfig.fields || [];

    // ── Build contact data from form_config mappings ────────────────────────
    const contactData: Record<string, any> = {
      organization_id: orgId,
      source: `Landing: ${page.name}`,
      status: "new",
    };
    const activityNotes: { label: string; value: string }[] = [];
    const tagsToAdd: string[] = [];

    // Helper to set a CRM field from a value
    function applyMapping(crmField: string, value: string) {
      if (!crmField || crmField === "_ignore" || !value) return;
      switch (crmField) {
        case "full_name": {
          const parts = value.trim().split(/\s+/);
          contactData.first_name = parts[0] || "";
          contactData.last_name = parts.slice(1).join(" ") || "";
          contactData.full_name = value.trim();
          break;
        }
        case "first_name":
          contactData.first_name = value.trim();
          contactData.full_name = [value.trim(), contactData.last_name || ""].join(" ").trim();
          break;
        case "last_name":
          contactData.last_name = value.trim();
          contactData.full_name = [contactData.first_name || "", value.trim()].join(" ").trim();
          break;
        case "primary_email":
          contactData.primary_email = value.toLowerCase().trim();
          break;
        case "primary_phone":
          contactData.primary_phone = value;
          break;
        case "_note":
          activityNotes.push({ label: crmField, value });
          break;
        case "_tag":
          tagsToAdd.push(value);
          break;
        default:
          // Direct field mapping (city, country, notes, source, utm_*, etc.)
          contactData[crmField] = value;
      }
    }

    if (configFields.length > 0) {
      // Use configured field mappings
      for (const field of configFields) {
        const rawValue = body[field.name];
        if (rawValue == null || rawValue === "") continue;
        applyMapping(field.crm_field, String(rawValue));
      }
    } else {
      // Fallback: legacy name/email/phone fields
      const { name, email, phone } = body;
      if (!email && !name) throw new Error("At least name or email is required");
      if (name) applyMapping("full_name", name);
      if (email) applyMapping("primary_email", email);
      if (phone) applyMapping("primary_phone", phone);
    }

    // ── Capture UTM parameters (always, independent of field mappings) ────────
    // These are passed automatically by the page script from window.location.search.
    const UTM_FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
    for (const utm of UTM_FIELDS) {
      const v = body[utm];
      if (v && String(v).trim()) contactData[utm] = String(v).trim();
    }

    // Ensure full_name is set (required NOT NULL)
    if (!contactData.full_name) {
      contactData.full_name = [contactData.first_name, contactData.last_name].filter(Boolean).join(" ")
        || contactData.primary_email
        || "Lead";
    }

    // ── Dedup by email ──────────────────────────────────────────────────────
    let contactId: string | null = null;
    if (contactData.primary_email) {
      const { data: existing } = await supabase
        .from("contacts")
        .select("id, tags")
        .eq("organization_id", orgId)
        .eq("primary_email", contactData.primary_email)
        .maybeSingle();

      if (existing) {
        contactId = existing.id;
        // Patch missing fields on existing contact
        const patch: Record<string, any> = {};
        if (contactData.primary_phone) patch.primary_phone = contactData.primary_phone;
        if (contactData.first_name)    patch.first_name    = contactData.first_name;
        if (contactData.last_name)     patch.last_name     = contactData.last_name;
        if (contactData.city)          patch.city          = contactData.city;
        if (contactData.country)       patch.country       = contactData.country;
        if (contactData.notes)         patch.notes         = contactData.notes;
        // Always overwrite UTMs with the latest visit's attribution
        for (const utm of UTM_FIELDS) {
          if (contactData[utm]) patch[utm] = contactData[utm];
        }
        if (tagsToAdd.length) {
          const merged = [...new Set([...(existing.tags || []), ...tagsToAdd])];
          patch.tags = merged;
        }
        if (Object.keys(patch).length) {
          await supabase.from("contacts").update(patch).eq("id", contactId);
        }
      }
    }

    // ── Create contact if not found ─────────────────────────────────────────
    if (!contactId) {
      if (tagsToAdd.length) contactData.tags = tagsToAdd;

      const { data: created, error: createErr } = await supabase
        .from("contacts")
        .insert(contactData)
        .select("id")
        .single();

      if (createErr) throw createErr;
      contactId = created.id;

      // Increment leads counter on the landing page
      await supabase.rpc("inc_landing_page_leads", { p_page_id: page_id });
    }

    // ── Auto-assign to pipeline/stage if configured ──────────────────────────
    if (formConfig.pipeline_id && formConfig.stage_id) {
      await supabase.from("contacts").update({
        pipeline_id: formConfig.pipeline_id,
        stage_id: formConfig.stage_id,
        lead_status: "active",
      }).eq("id", contactId);
    }

    // ── Log activity ────────────────────────────────────────────────────────
    const extraNotes = activityNotes.map(n => `${n.label}: ${n.value}`).join(", ");
    const pipelineNote = formConfig.stage_name
      ? ` → Pipeline: ${formConfig.pipeline_name || ""} / ${formConfig.stage_name}`
      : "";
    // Use try/catch instead of .catch() — PostgrestBuilder in Deno doesn't always
    // expose a .catch() method directly (depends on client version).
    try {
      await supabase.from("activities").insert({
        organization_id: orgId,
        contact_id: contactId,
        type: "note",
        title: `Lead desde landing: ${page.name}`,
        description: `Formulario enviado desde ${body.source || "landing page"}${pipelineNote}${extraNotes ? ". " + extraNotes : ""}`,
      });
    } catch (_) { /* non-critical */ }

    // ── Fire automation trigger (fire-and-forget) ────────────────────────────
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    (async () => {
      try {
        await fetch(`${supabaseUrl}/functions/v1/automation-runner`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            action: "trigger_event",
            trigger_type: "landing_form_submitted",
            contact_id: contactId,
            trigger_data: { landing_slug: page.id, landing_name: page.name, source: body.source },
          }),
        });
      } catch (_) { /* non-critical */ }
    })();

    // ── Fire outbound webhook: form.submitted (fire-and-forget) ─────────────
    (async () => {
      try {
        await fetch(`${supabaseUrl}/functions/v1/webhook-dispatcher`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "form.submitted",
            organization_id: orgId,
            data: {
              contact_id: contactId,
              landing_page_id: page.id,
              landing_page_name: page.name,
              form_data: body,
            },
          }),
        });
      } catch (_) { /* non-critical */ }
    })();

    // ── Resolve redirect URL (read fresh from DB at submit time) ───────────────
    // Return form_config.redirect_url as-is (set explicitly by the builder using pages.klosify.com).
    // If empty, the browser falls back to the baked-in thankyouSlug in serve-landing's override script,
    // building the full URL at runtime with window.location.origin (always the correct domain).
    // supabaseUrl already declared above (automation trigger block).
    const redirectUrl: string = formConfig.redirect_url || "";

    return new Response(
      JSON.stringify({ success: true, contact_id: contactId, redirect_url: redirectUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("landing-submit error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
