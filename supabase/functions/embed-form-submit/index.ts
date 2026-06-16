import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public edge function (no JWT) — receives lead submissions from the embeddable
// Klosify form placed on ANY external site/builder. The org is resolved by a
// public form token (safe to expose: it only allows creating a contact).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const STANDARD_FIELDS = new Set([
  "first_name", "last_name", "full_name", "primary_email", "primary_phone",
  "company_name", "city", "country", "notes", "source", "campaign",
]);
const UTM_FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

// Common aliases so the embed form is forgiving about field names.
const ALIASES: Record<string, string> = {
  name: "full_name", nombre: "first_name", apellido: "last_name",
  email: "primary_email", correo: "primary_email", mail: "primary_email",
  phone: "primary_phone", telefono: "primary_phone", celular: "primary_phone", whatsapp: "primary_phone",
  empresa: "company_name", company: "company_name",
  ciudad: "city", pais: "country", mensaje: "notes", message: "notes",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const ct = req.headers.get("content-type") || "";
    let body: Record<string, any>;
    if (ct.includes("application/json")) body = await req.json();
    else if (ct.includes("urlencoded") || ct.includes("multipart")) {
      const fd = await req.formData(); body = {};
      fd.forEach((v, k) => { body[k] = v; });
    } else {
      const t = await req.text();
      try { body = JSON.parse(t); } catch { body = Object.fromEntries(new URLSearchParams(t)); }
    }

    const token = body.token || body.form_token;
    if (!token) throw new Error("token is required");

    const { data: org } = await supabase
      .from("organizations").select("id").eq("public_form_token", token).maybeSingle();
    if (!org) throw new Error("Invalid form token");
    const orgId = org.id;

    // Build contact from body, applying aliases + custom fields.
    const contactData: Record<string, any> = {
      organization_id: orgId,
      source: (body.source && String(body.source).trim()) || "Formulario web",
      status: "new",
    };
    const customFields: Record<string, any> = {};
    for (const [rawKey, rawVal] of Object.entries(body)) {
      if (rawVal == null || rawVal === "") continue;
      if (["token", "form_token", "page_id"].includes(rawKey)) continue;
      const key = ALIASES[rawKey] || rawKey;
      const val = String(rawVal).trim();
      if (STANDARD_FIELDS.has(key)) contactData[key] = val;
      else if ((UTM_FIELDS as readonly string[]).includes(key)) contactData[key] = val;
      else if (key === "tags") contactData.tags = val.split(",").map(s => s.trim()).filter(Boolean);
      else if (!["source"].includes(key)) customFields[key] = val; // unknown → custom field
    }
    if (Object.keys(customFields).length) contactData.custom_fields = customFields;

    if (!contactData.full_name) {
      contactData.full_name = [contactData.first_name, contactData.last_name].filter(Boolean).join(" ")
        || contactData.primary_email || contactData.primary_phone || "Lead";
    }

    if (!contactData.primary_email && !contactData.primary_phone) {
      throw new Error("Se requiere al menos email o teléfono");
    }

    // Dedup by NORMALIZED phone (digits-only) or email so the same lead from
    // another channel is recognized regardless of phone format.
    let contactId: string | null = null;
    let existing: any = null;
    if (contactData.primary_email || contactData.primary_phone) {
      const { data: matchId } = await supabase.rpc("match_contact", {
        p_org: orgId,
        p_phone: contactData.primary_phone || null,
        p_email: contactData.primary_email || null,
      });
      if (matchId) {
        ({ data: existing } = await supabase.from("contacts")
          .select("id, tags").eq("id", matchId as string).maybeSingle());
      }
    }

    if (existing) {
      contactId = existing.id;
      const patch: Record<string, any> = {};
      for (const f of ["primary_phone", "primary_email", "first_name", "last_name", "city", "country", "notes", "company_name"]) {
        if (contactData[f]) patch[f] = contactData[f];
      }
      for (const utm of UTM_FIELDS) if (contactData[utm]) patch[utm] = contactData[utm]; // latest attribution
      if (Object.keys(patch).length) await supabase.from("contacts").update(patch).eq("id", contactId);
    } else {
      const { data: created, error: createErr } = await supabase
        .from("contacts").insert(contactData).select("id").single();
      if (createErr) throw createErr;
      contactId = created.id;

      // Fire contact_created automation trigger (fire-and-forget)
      fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/automation-runner`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        body: JSON.stringify({
          action: "trigger_event", trigger_type: "contact_created",
          contact_id: contactId, trigger_data: { origin: "embed_form", source: "embed_form" },
        }),
      }).catch(() => {});
    }

    return new Response(JSON.stringify({ success: true, contact_id: contactId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("embed-form-submit error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
