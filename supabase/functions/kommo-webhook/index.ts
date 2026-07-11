/**
 * kommo-webhook — sincronización en tiempo real Kommo → Klosify.
 *
 * Kommo envía webhooks form-urlencoded cuando un lead se crea, se actualiza o
 * cambia de etapa. Este handler busca el lead en Kommo (con sus contactos),
 * lo empareja en Klosify (kommo_lead_id → teléfono → email) y actualiza etapa,
 * estado ganado/perdido y presupuesto — o lo crea si no existe.
 *
 * Seguridad: la URL registrada en Kommo lleva ?key=<KOMMO_WEBHOOK_KEY>&org=<uuid>.
 * Acción de gestión (auth service-role): {action:"register"|"list"|"unregister"}.
 *
 * Es un flujo UNIDIRECCIONAL (Kommo → Klosify); no hay riesgo de bucles.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const KOMMO_TOKEN = Deno.env.get("KOMMO_TOKEN") ?? "";
const KOMMO_SUBDOMAIN = Deno.env.get("KOMMO_SUBDOMAIN") ?? "";
const BASE = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4`;
const KOMMO_WON = 142, KOMMO_LOST = 143;

// Debe coincidir con kommo-migrate.
const STAGE_ALIASES: Record<string, string> = {
  "lead nuevo": "nuevo contacto",
  "incoming leads": "nuevo contacto",
  "no interesados": "no interesado",
  "calientes (pendientes de pago)": "calientes",
  "no asistio": "no asiste a cita",
  "no asistió": "no asiste a cita",
};

const normPhone = (s: string) => (s || "").replace(/[^0-9]/g, "");

async function kommo(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${KOMMO_TOKEN}` } });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Kommo ${path} → HTTP ${res.status}`);
  return body;
}

// status_id → nombre de etapa Kommo (cacheado por invocación caliente)
let statusNameCache: Map<number, string> | null = null;
async function statusName(id: number): Promise<string | null> {
  if (!statusNameCache) {
    statusNameCache = new Map();
    const pipes = await kommo("/leads/pipelines");
    for (const p of pipes?._embedded?.pipelines ?? [])
      for (const s of p._embedded?.statuses ?? []) statusNameCache.set(s.id, s.name);
  }
  return statusNameCache.get(id) ?? null;
}

async function processLead(supabase: any, orgId: string, kommoLeadId: string) {
  const lead = await kommo(`/leads/${kommoLeadId}?with=contacts`);
  if (!lead) return { skipped: "lead not found in Kommo" };

  // Datos de contacto (teléfono/email del primer contacto vinculado)
  let phone: string | null = null, email: string | null = null, fullName: string | null = null;
  const contactRef = lead._embedded?.contacts?.[0];
  if (contactRef?.id) {
    const kc = await kommo(`/contacts/${contactRef.id}`);
    fullName = kc?.name ?? null;
    for (const f of kc?.custom_fields_values ?? []) {
      const code = (f.field_code || "").toUpperCase();
      const val = f.values?.[0]?.value;
      if (code === "PHONE" && val && !phone) phone = String(val);
      if (code === "EMAIL" && val && !email) email = String(val);
    }
  }

  // Etapa destino en Klosify
  const { data: pipeline } = await supabase.from("pipelines").select("id")
    .eq("organization_id", orgId).order("created_at").limit(1).maybeSingle();
  if (!pipeline) return { error: "org sin pipeline" };
  const { data: stages } = await supabase.from("pipeline_stages")
    .select("id, name").eq("pipeline_id", pipeline.id);
  const stageByName = new Map((stages ?? []).map((s: any) => [s.name.trim().toLowerCase(), s.id]));

  const sid = Number(lead.status_id);
  let stageId: string | null = null;
  let leadStatus = "active";
  if (sid === KOMMO_WON) {
    leadStatus = "won";
    stageId = [...stageByName.entries()].find(([n]) => /ganad|won/.test(n))?.[1] ?? null;
  } else if (sid === KOMMO_LOST) {
    leadStatus = "lost";
    stageId = [...stageByName.entries()].find(([n]) => /perdid|lost/.test(n))?.[1] ?? null;
  } else {
    const kName = ((await statusName(sid)) ?? "").trim().toLowerCase();
    const mapped = STAGE_ALIASES[kName] ?? kName;
    stageId = stageByName.get(mapped) ?? null;
  }

  // Match en Klosify: kommo_lead_id → teléfono → email
  let contactId: string | null = null;
  const { data: byKid } = await supabase.from("contacts").select("id")
    .eq("organization_id", orgId).contains("custom_fields", { kommo_lead_id: String(lead.id) })
    .limit(1).maybeSingle();
  if (byKid) contactId = byKid.id;
  if (!contactId && (phone || email)) {
    const { data: matchId } = await supabase.rpc("match_contact", {
      p_org: orgId, p_phone: phone, p_email: email,
    });
    contactId = (matchId as string) || null;
  }

  const patch: Record<string, unknown> = { lead_status: leadStatus };
  if (stageId) { patch.stage_id = stageId; patch.pipeline_id = pipeline.id; }
  if (lead.price && Number(lead.price) > 0) patch.budget = Number(lead.price);

  if (contactId) {
    // Preservar/registrar la referencia a Kommo sin pisar otros custom fields
    const { data: cur } = await supabase.from("contacts").select("custom_fields").eq("id", contactId).maybeSingle();
    patch.custom_fields = { ...(cur?.custom_fields ?? {}), kommo_lead_id: String(lead.id) };
    const { error } = await supabase.from("contacts").update(patch).eq("id", contactId).eq("organization_id", orgId);
    if (error) return { error: error.message };
    return { updated: contactId, stage: stageId, lead_status: leadStatus };
  }

  // Crear si trae al menos teléfono o email
  if (!phone && !email) return { skipped: "sin teléfono/email — no se crea" };
  const nameParts = (fullName || lead.name || "Lead Kommo").trim().split(/\s+/);
  const { data: ownerRow } = await supabase.from("organization_members")
    .select("user_id").eq("organization_id", orgId).eq("role", "owner").limit(1).maybeSingle();
  const { data: created, error: cErr } = await supabase.from("contacts").insert({
    organization_id: orgId,
    owner_id: ownerRow?.user_id ?? null,
    first_name: nameParts[0] || null,
    last_name: nameParts.slice(1).join(" ") || null,
    full_name: fullName || lead.name || "Lead Kommo",
    primary_phone: phone,
    primary_email: email,
    source: "kommo",
    status: "new",
    custom_fields: { kommo_lead_id: String(lead.id) },
    ...patch,
  }).select("id").single();
  if (cErr) return { error: cErr.message };
  return { created: created.id, stage: stageId, lead_status: leadStatus };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const url = new URL(req.url);

  try {
    // ── Gestión (registrar/listar/eliminar el webhook en Kommo) ────────────
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const auth = req.headers.get("authorization") ?? "";
      if (!auth.includes(serviceKey)) return json({ error: "forbidden" }, 403);
      const body = await req.json();
      if (body.action === "register") {
        const dest = body.destination;
        if (!dest) return json({ error: "destination requerida" }, 400);
        const res = await fetch(`${BASE}/webhooks`, {
          method: "POST",
          headers: { Authorization: `Bearer ${KOMMO_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ destination: dest, settings: ["add_lead", "update_lead", "status_lead"] }),
        });
        return json(await res.json().catch(() => ({ status: res.status })), res.ok ? 200 : 500);
      }
      if (body.action === "list") {
        return json(await kommo("/webhooks"));
      }
      if (body.action === "unregister") {
        const res = await fetch(`${BASE}/webhooks`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${KOMMO_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ destination: body.destination }),
        });
        return json({ status: res.status });
      }
      return json({ error: "acción desconocida" }, 400);
    }

    // ── Webhook de Kommo (form-urlencoded) ──────────────────────────────────
    // Kommo re-escapa "&" como "&amp;" en algunas rutas — aceptar ambas formas.
    const key = url.searchParams.get("key") ?? url.searchParams.get("amp;key") ?? "";
    const orgId = url.searchParams.get("org") ?? url.searchParams.get("amp;org") ?? "";
    if (!key || key !== (Deno.env.get("KOMMO_WEBHOOK_KEY") ?? "")) return json({ error: "forbidden" }, 403);
    if (!orgId) return json({ error: "org requerida" }, 400);

    const raw = await req.text();
    const params = new URLSearchParams(raw);
    // Kommo manda leads[status|add|update][N][id]
    const leadIds = new Set<string>();
    for (const [k, v] of params.entries()) {
      const m = k.match(/^leads\[(status|add|update)\]\[\d+\]\[id\]$/);
      if (m && v) leadIds.add(v);
    }
    if (!leadIds.size) return json({ ok: true, skipped: "sin leads en el payload" });

    const results: any[] = [];
    for (const id of leadIds) {
      try {
        results.push({ lead: id, ...(await processLead(supabase, orgId, id)) });
      } catch (e: any) {
        results.push({ lead: id, error: String(e?.message ?? e) });
      }
    }
    console.log("kommo-webhook:", JSON.stringify(results));
    return json({ ok: true, results });
  } catch (e: any) {
    console.error("kommo-webhook error:", e);
    // 200 para que Kommo no desactive el webhook por reintentos fallidos
    return json({ ok: false, error: String(e?.message ?? e) });
  }
});
