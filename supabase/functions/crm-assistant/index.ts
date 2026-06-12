// crm-assistant — natural-language assistant over the user's CRM.
//
// Safety model: the LLM never writes SQL. It can only CALL a small set of
// well-defined tools; every tool query is executed server-side and HARD-scoped to
// the caller's organization_id (resolved from their JWT), so one org can never
// read another's data. Read-only for the MVP.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENAI_API = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `Eres el asistente de Klosify CRM. Ayudas al usuario a consultar sus leads y su pipeline.
- Responde SIEMPRE en español, breve y claro.
- Cuando el usuario quiera ver/filtrar leads (ej. "los más calientes", "sin asignar", "de tal campaña", "de esta semana"), llama a la herramienta filter_leads. "Caliente" = score alto (hot), "tibio" = warm, "frío" = cold.
- Para un panorama del pipeline usa pipeline_summary. Para encontrar a alguien usa search_contact.
- NO inventes datos: usa solo lo que devuelven las herramientas.
- Tras filtrar, resume el resultado en 1-2 frases (cuántos hay y un par de ejemplos) e invita a verlos en Leads.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "filter_leads",
      description: "Filtra y cuenta los leads del usuario según criterios. Devuelve el total, una muestra y los filtros para abrir la vista de Leads.",
      parameters: {
        type: "object",
        properties: {
          temperature: { type: "string", enum: ["hot", "warm", "cold"], description: "Temperatura por score: hot(>=61), warm(31-60), cold(<=30)" },
          status: { type: "string", enum: ["all", "active", "won", "lost", "unassigned"], description: "Estado del lead" },
          source: { type: "string", description: "Origen exacto, ej. facebook_ads, whatsapp, manual" },
          tag: { type: "string", description: "Etiqueta EXACTA del catálogo de la organización (usa una de las disponibles que te di)" },
          search: { type: "string", description: "Texto a buscar en nombre o email" },
          created_since_days: { type: "number", description: "Solo leads creados en los últimos N días" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pipeline_summary",
      description: "Resumen del pipeline: cuántos leads hay por etapa.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "search_contact",
      description: "Busca contactos por nombre, email o teléfono. Devuelve hasta 10 coincidencias.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Nombre, email o teléfono" } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
];

function tempRange(t?: string): { gte?: number; lte?: number } {
  if (t === "hot") return { gte: 61 };
  if (t === "warm") return { gte: 31, lte: 60 };
  if (t === "cold") return { lte: 30 };
  return {};
}

// Build the contacts query scoped to the org + the requested filters.
function buildLeadsQuery(supabase: any, orgId: string, args: any, selectExpr: string, opts: { count?: boolean } = {}) {
  let q = supabase.from("contacts").select(selectExpr, opts.count ? { count: "exact" } : undefined)
    .eq("organization_id", orgId);
  const status = args.status;
  if (status === "unassigned") q = q.is("pipeline_id", null);
  else if (status && status !== "all") q = q.eq("lead_status", status);
  if (args.source) q = q.eq("source", args.source);
  if (args.tag) q = q.contains("tags", [args.tag]);
  if (args.search) q = q.or(`full_name.ilike.%${args.search}%,primary_email.ilike.%${args.search}%`);
  const tr = tempRange(args.temperature);
  if (tr.gte != null) q = q.gte("score", tr.gte);
  if (tr.lte != null) q = q.lte("score", tr.lte);
  if (args.created_since_days) {
    const since = new Date(Date.now() - args.created_since_days * 86400000).toISOString();
    q = q.gte("created_at", since);
  }
  return q;
}

async function runTool(name: string, args: any, supabase: any, orgId: string): Promise<{ result: any; action?: any }> {
  if (name === "filter_leads") {
    const { count } = await buildLeadsQuery(supabase, orgId, args, "id", { count: true })
      .limit(1);
    const { data: sample } = await buildLeadsQuery(supabase, orgId, args, "full_name, score")
      .order("score", { ascending: false }).limit(5);
    return {
      result: { count: count ?? 0, sample: (sample || []).map((s: any) => ({ name: s.full_name, score: s.score })) },
      action: { type: "navigate_leads", filters: {
        temperature: args.temperature ?? null,
        status: args.status ?? null,
        source: args.source ?? null,
        tag: args.tag ?? null,
        search: args.search ?? null,
        created_since_days: args.created_since_days ?? null,
      } },
    };
  }
  if (name === "pipeline_summary") {
    const { data } = await supabase.from("contacts")
      .select("stage_id, pipeline_stages(name)")
      .eq("organization_id", orgId);
    const counts: Record<string, number> = {};
    for (const r of (data || [])) {
      const stage = (r as any).pipeline_stages?.name || "Sin etapa";
      counts[stage] = (counts[stage] || 0) + 1;
    }
    return { result: { total: (data || []).length, by_stage: counts } };
  }
  if (name === "search_contact") {
    const { data } = await supabase.from("contacts")
      .select("id, full_name, primary_phone, primary_email, score")
      .eq("organization_id", orgId)
      .or(`full_name.ilike.%${args.query}%,primary_email.ilike.%${args.query}%,primary_phone.ilike.%${args.query}%`)
      .limit(10);
    const matches = (data || []).map((c: any) => ({ id: c.id, name: c.full_name, phone: c.primary_phone, score: c.score }));
    return {
      result: { matches },
      action: matches.length ? { type: "open_contact", matches: matches.map((m: any) => ({ id: m.id, name: m.name })) } : undefined,
    };
  }
  return { result: { error: "unknown tool" } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "AI no configurada" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Resolve the caller and their organization from the JWT.
    const authHeader = req.headers.get("Authorization") || "";
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const orgId: string | null = body.organization_id ?? null;
    // Verify membership of the requested org (never trust the client blindly).
    let resolvedOrg = orgId;
    const { data: mem } = await supabase.from("organization_members")
      .select("organization_id").eq("user_id", user.id);
    const memberOrgs = (mem || []).map((m: any) => m.organization_id);
    if (!resolvedOrg || !memberOrgs.includes(resolvedOrg)) resolvedOrg = memberOrgs[0] ?? null;
    if (!resolvedOrg) return new Response(JSON.stringify({ error: "Sin organización" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Give the model the org's real tags and sources so it can map fuzzy mentions
    // ("verdanzza") to the exact catalog value ("Lanzamiento Verdanzza").
    const [{ data: tagRows }, { data: srcRows }] = await Promise.all([
      supabase.from("organization_tags").select("name").eq("organization_id", resolvedOrg).limit(100),
      supabase.from("contacts").select("source").eq("organization_id", resolvedOrg).not("source", "is", null).limit(1000),
    ]);
    const availableTags = [...new Set((tagRows || []).map((t: any) => t.name))];
    const availableSources = [...new Set((srcRows || []).map((s: any) => s.source).filter(Boolean))];
    const contextNote = `\n\nEtiquetas disponibles en esta organización: ${availableTags.length ? availableTags.join(", ") : "(ninguna)"}.\nOrígenes (source) disponibles: ${availableSources.length ? availableSources.join(", ") : "(ninguno)"}.\nCuando el usuario mencione una etiqueta de forma aproximada, mapéala a la etiqueta EXACTA de la lista y usa filter_leads con el parámetro tag.`;

    const history = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    const messages: any[] = [{ role: "system", content: SYSTEM_PROMPT + contextNote }, ...history];

    let action: any = null;

    // Tool-calling loop (max 3 rounds).
    for (let round = 0; round < 3; round++) {
      const res = await fetch(OPENAI_API, {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, tool_choice: "auto", temperature: 0.2 }),
      });
      const data = await res.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) return new Response(JSON.stringify({ error: "Sin respuesta de IA" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      messages.push(msg);

      if (msg.tool_calls?.length) {
        for (const tc of msg.tool_calls) {
          let args: any = {};
          try { args = JSON.parse(tc.function.arguments || "{}"); } catch (_) { /* ignore */ }
          const { result, action: a } = await runTool(tc.function.name, args, supabase, resolvedOrg);
          if (a) action = a;
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        continue; // let the model read tool results and respond
      }

      // Final assistant text
      return new Response(JSON.stringify({ reply: msg.content ?? "", action }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ reply: "No pude completar la consulta, intenta reformularla.", action }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("crm-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
