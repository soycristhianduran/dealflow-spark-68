// Meta Conversions API — envía eventos de conversión del CRM al píxel de la
// organización cuando un lead entra a una etapa mapeada (trigger en contacts).
// Los datos de usuario van hasheados (SHA-256) como exige Meta, y se incluye
// lead_id del Lead Ad cuando existe para la optimización "Conversion Leads".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH_API = "https://graph.facebook.com/v21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-conversion-key",
};

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const normPhone = (p: string) => p.replace(/\D/g, "");
const normEmail = (e: string) => e.trim().toLowerCase();
const normName = (n: string) => n.trim().toLowerCase();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ok = (data: unknown) =>
    new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.headers.get("x-conversion-key") !== (Deno.env.get("META_CAPI_KEY") || "klosify-meta-capi-2026")) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { contact_id, stage_id, organization_id } = await req.json();
  if (!contact_id || !stage_id || !organization_id) return ok({ skipped: "missing params" });

  const log = async (status: string, event_name: string | null, error?: string) => {
    await supabase.from("meta_conversion_logs").insert({
      organization_id, contact_id, stage_id, event_name, status, error: error ?? null,
    });
  };

  try {
    // Mapeo etapa → evento (validando que pertenezca a la org del contacto).
    const { data: mapping } = await supabase
      .from("meta_conversion_mappings")
      .select("event_name")
      .eq("stage_id", stage_id)
      .eq("organization_id", organization_id)
      .maybeSingle();
    if (!mapping) return ok({ skipped: "no mapping" });

    const { data: settings } = await supabase
      .from("meta_conversion_settings")
      .select("pixel_id, enabled")
      .eq("organization_id", organization_id)
      .maybeSingle();
    if (!settings?.enabled || !settings?.pixel_id) {
      await log("skipped", mapping.event_name, "CAPI sin configurar (pixel) o deshabilitada");
      return ok({ skipped: "no pixel configured" });
    }

    // Token del conector de Meta de la org (usuario que conectó las páginas).
    const { data: page } = await supabase
      .from("facebook_pages")
      .select("user_id")
      .eq("organization_id", organization_id)
      .limit(1)
      .maybeSingle();
    const { data: tok } = page
      ? await supabase.from("facebook_tokens").select("access_token").eq("user_id", page.user_id).maybeSingle()
      : { data: null };
    if (!tok?.access_token) {
      await log("error", mapping.event_name, "Sin token de Meta para la organización");
      return ok({ error: "no token" });
    }

    const { data: contact } = await supabase
      .from("contacts")
      .select("primary_email, primary_phone, first_name, last_name, budget, budget_currency, city, country, won_product_id, ctwa_clid")
      .eq("id", contact_id)
      .eq("organization_id", organization_id)
      .maybeSingle();
    if (!contact) return ok({ skipped: "contact not found" });

    // lead_id del Lead Ad original (si el contacto vino de un formulario de Meta)
    const { data: ingestion } = await supabase
      .from("meta_lead_ingestions")
      .select("leadgen_id")
      .eq("contact_id", contact_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const userData: Record<string, unknown> = {};
    if (contact.primary_email) userData.em = [await sha256(normEmail(contact.primary_email))];
    if (contact.primary_phone) userData.ph = [await sha256(normPhone(contact.primary_phone))];
    if (contact.first_name) userData.fn = [await sha256(normName(contact.first_name))];
    if (contact.last_name) userData.ln = [await sha256(normName(contact.last_name))];
    if (contact.city) userData.ct = [await sha256(normName(contact.city))];
    if (contact.country) userData.country = [await sha256(normName(contact.country))];
    if (ingestion?.leadgen_id && /^\d+$/.test(ingestion.leadgen_id)) {
      userData.lead_id = Number(ingestion.leadgen_id);
    }
    // Leads de clic-a-WhatsApp (CTWA): la atribución va por ctwa_clid y el
    // evento se marca como canal de mensajería, no como evento de sistema.
    let actionSource = "system_generated";
    if (contact.ctwa_clid) {
      userData.ctwa_clid = contact.ctwa_clid;
      const { data: waCfg } = await supabase
        .from("whatsapp_configs")
        .select("waba_id")
        .eq("organization_id", organization_id)
        .eq("is_active", true)
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (waCfg?.waba_id) userData.whatsapp_business_account_id = waCfg.waba_id;
      actionSource = "business_messaging";
    }

    if (!userData.em && !userData.ph && !userData.lead_id && !userData.ctwa_clid) {
      await log("skipped", mapping.event_name, "Contacto sin email/teléfono/lead_id/ctwa_clid — Meta no podría atribuirlo");
      return ok({ skipped: "no identifiers" });
    }

    const event: Record<string, unknown> = {
      event_name: mapping.event_name,
      event_time: Math.floor(Date.now() / 1000),
      // event_id estable por contacto+etapa: Meta deduplica reintentos.
      event_id: `${contact_id}:${stage_id}`,
      action_source: actionSource,
      user_data: userData,
    };
    if (actionSource === "business_messaging") {
      event.messaging_channel = "whatsapp";
    }
    // Valor de la conversión (habilita "Valor de conversión" y ROAS en el
    // administrador de anuncios). Prioridad: producto ganado > presupuesto.
    let value: number | null = null;
    let currency = contact.budget_currency || "COP";
    if (contact.won_product_id) {
      const { data: product } = await supabase
        .from("products")
        .select("default_price, currency")
        .eq("id", contact.won_product_id)
        .maybeSingle();
      if (product?.default_price && Number(product.default_price) > 0) {
        value = Number(product.default_price);
        currency = product.currency || currency;
      }
    }
    if (value === null && contact.budget && Number(contact.budget) > 0) {
      value = Number(contact.budget);
    }
    if (value !== null) {
      event.custom_data = { value, currency };
    }

    const res = await fetch(`${GRAPH_API}/${settings.pixel_id}/events?access_token=${tok.access_token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [event] }),
    });
    const json = await res.json();

    if (!res.ok) {
      await log("error", mapping.event_name, json?.error?.message || JSON.stringify(json).slice(0, 500));
      return ok({ error: json?.error?.message || "graph error" });
    }

    await log("sent", mapping.event_name);
    return ok({ sent: true, event_name: mapping.event_name, events_received: json?.events_received });
  } catch (e: any) {
    await log("error", null, String(e?.message ?? e));
    return ok({ error: String(e?.message ?? e) });
  }
});
