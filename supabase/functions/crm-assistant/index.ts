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
- Si el usuario describe un flujo/automatización ("crea una automatización que...", "cuando llegue un lead haz..."), usa create_automation. SIEMPRE queda como BORRADOR desactivado; dile al usuario que la revise y la active. Usa solo los triggers/pasos soportados.
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
      name: "create_automation",
      description: `Crea un BORRADOR de automatización (queda DESACTIVADA para que el usuario la revise y active). Construye trigger + pasos desde la descripción del usuario.
TRIGGERS válidos (usa exactamente estos type y config):
- contact_created { source?: "meta_lead_form"|"whatsapp"|"manual"|"api"|"landing"|"embed_form" }
- meta_lead_form { form_name?: string }
- tag_added { tag: string }
- contact_stage_changed { stage_name?: string }
PASOS válidos (type y config). INCLUYE TODOS los pasos que el usuario pida, en el ORDEN que los pida:
- add_tag { tag: string }
- remove_tag { tag: string }
- wait { delay_value: number, delay_unit: "minutes"|"hours"|"days" }
- create_task { title: string, due_in_days: number, assign_to_owner: boolean }
- notify_owner { message: string }
- send_whatsapp { template_name: string, language: "es" }
- send_email { subject: string }
- update_contact { field: string, value: string }
- condition { field: string, operator: string, value: string }
- assign_owner { mode: "specific", owner_name?: string }
- move_pipeline_stage { stage_name?: string }
Para etiquetas usa las del catálogo cuando aplique. Si falta un dato (plantilla, vendedor, etapa exactos), créalo igual con lo que tengas — el usuario lo completará al revisar.`,
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nombre corto del flujo" },
          trigger: {
            type: "object",
            properties: { type: { type: "string" }, config: { type: "object" } },
            required: ["type"],
          },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: { type: { type: "string" }, config: { type: "object" } },
              required: ["type"],
            },
          },
        },
        required: ["name", "trigger", "steps"],
      },
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
  {
    type: "function",
    function: {
      name: "top_ads",
      description: "Anuncios, campañas o canales con mejor desempeño, usando la atribución UTM de los leads (requiere cuenta publicitaria conectada y leads con UTM). Úsalo para '¿qué anuncio me ha generado más LEADS?' (metric=leads) o '¿qué anuncio generó más VENTAS/INGRESOS?' (metric=won).",
      parameters: {
        type: "object",
        properties: {
          metric: { type: "string", enum: ["leads", "won"], description: "leads = cuántos leads trajo cada anuncio (todos los contactos atribuidos). won = ventas ganadas e ingresos. Elige 'leads' si preguntan por leads, 'won' si preguntan por ventas/ingresos. Default: leads." },
          dimension: { type: "string", enum: ["ad", "campaign", "source"], description: "Agrupar por anuncio (utm_content), campaña (utm_campaign) o canal (utm_source). Default: ad." },
          since_days: { type: "number", description: "Solo de los últimos N días" },
          limit: { type: "number", description: "Cuántos resultados top devolver (default 5)" },
        },
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

const ALLOWED_TRIGGERS = new Set(["contact_created", "meta_lead_form", "tag_added", "contact_stage_changed", "landing_form_submitted"]);
const ALLOWED_STEPS = new Set([
  "add_tag", "remove_tag", "wait", "create_task", "notify_owner", "send_whatsapp",
  "send_email", "update_contact", "condition", "assign_owner", "move_pipeline_stage",
]);

async function runTool(name: string, args: any, supabase: any, orgId: string, userId: string): Promise<{ result: any; action?: any }> {
  if (name === "create_automation") {
    const tType = args?.trigger?.type;
    if (!tType || !ALLOWED_TRIGGERS.has(tType)) return { result: { error: "Trigger no soportado." } };
    const tConfig = (args.trigger.config && typeof args.trigger.config === "object") ? args.trigger.config : {};

    const rawSteps = Array.isArray(args.steps) ? args.steps : [];
    const steps: any[] = [];
    const skipped: string[] = [];
    for (let i = 0; i < rawSteps.length; i++) {
      const s = rawSteps[i];
      if (!s || !ALLOWED_STEPS.has(s.type)) { if (s?.type) skipped.push(s.type); continue; }
      let config = (s.config && typeof s.config === "object") ? s.config : {};
      // Normalize tags to the catalog's canonical casing (create if new).
      if ((s.type === "add_tag" || s.type === "remove_tag") && config.tag) {
        const { data: existing } = await supabase.from("organization_tags")
          .select("name").eq("organization_id", orgId).ilike("name", config.tag).limit(1).maybeSingle();
        if (existing?.name) config = { ...config, tag: existing.name };
        else if (s.type === "add_tag") await supabase.from("organization_tags").insert({ organization_id: orgId, name: config.tag });
      }
      steps.push({ id: crypto.randomUUID().slice(0, 8), type: s.type, config, position: { x: 0, y: i * 140 } });
    }
    if (!steps.length) return { result: { error: "No se generaron pasos válidos." } };

    const { data: created, error } = await supabase.from("automations").insert({
      name: args.name || "Flujo creado por IA",
      organization_id: orgId,
      user_id: userId,
      trigger_type: tType,
      trigger_config: tConfig,
      triggers: [{ type: tType, config: tConfig }],
      steps,
      is_active: false, // ALWAYS a draft — the user reviews and activates.
    }).select("id, name").single();
    if (error) return { result: { error: error.message } };
    return {
      result: {
        created: true, id: created.id, name: created.name,
        trigger: tType, steps: steps.map((s: any) => s.type), steps_count: steps.length,
        skipped_unsupported: skipped,
        note: "Creada DESACTIVADA. Resume al usuario el trigger y los pasos creados (en orden); si hubo pasos no soportados, avísale. Indícale que la revise y active.",
      },
      action: { type: "open_automation", id: created.id, name: created.name },
    };
  }

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
  if (name === "top_ads") {
    const metric = args.metric === "won" ? "won" : "leads";
    const dim = args.dimension === "campaign" ? "utm_campaign"
      : args.dimension === "source" ? "utm_source" : "utm_content";
    const sinceIso = args.since_days
      ? new Date(Date.now() - args.since_days * 86400000).toISOString() : null;
    const lim = Math.max(1, Math.min(20, args.limit || 5));

    let q = supabase.from("contacts")
      .select("budget, utm_content, utm_campaign, utm_source, created_at")
      .eq("organization_id", orgId)
      .not(dim, "is", null);

    if (metric === "won") {
      // "Ganado" = lead_status 'won' OR a won-type pipeline stage (name ~ "gan"/"won").
      const { data: wonStages } = await supabase.from("pipeline_stages")
        .select("id, name").eq("organization_id", orgId)
        .or("name.ilike.%gan%,name.ilike.%won%");
      const wonStageIds = (wonStages || []).map((s: any) => s.id);
      const orParts = ["lead_status.eq.won"];
      if (wonStageIds.length) orParts.push(`stage_id.in.(${wonStageIds.join(",")})`);
      q = q.or(orParts.join(","));
    }
    if (sinceIso) q = q.gte("created_at", sinceIso);

    const { data } = await q.limit(10000);
    const agg: Record<string, { count: number; revenue: number }> = {};
    for (const c of (data || [])) {
      const k = (c as any)[dim];
      if (!k) continue;
      if (!agg[k]) agg[k] = { count: 0, revenue: 0 };
      agg[k].count += 1;
      agg[k].revenue += Number((c as any).budget || 0);
    }
    const top = Object.entries(agg)
      .map(([k, v]) => metric === "won"
        ? { name: k, ganados: v.count, ingresos: v.revenue }
        : { name: k, leads: v.count })
      .sort((a: any, b: any) => metric === "won" ? b.ingresos - a.ingresos : b.leads - a.leads)
      .slice(0, lim);
    return {
      result: {
        metric, dimension: dim, top,
        note: top.length ? null
          : "No hay datos de atribución UTM. Verifica que la cuenta publicitaria esté conectada y que los leads lleguen con UTM (utm_campaign / utm_content).",
      },
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

    // Enforce the plan's monthly assistant quota (anti-abuse + upsell lever).
    const { data: allowed } = await supabase.rpc("consume_ai_assistant_quota", { p_org_id: resolvedOrg });
    if (allowed === false) {
      return new Response(JSON.stringify({
        reply: "Alcanzaste el límite mensual de consultas del Asistente IA de tu plan. Sube de plan para seguir usándolo este mes. 🚀",
        limitReached: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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
    let asIn = 0, asOut = 0; // accumulate token usage across the tool loop
    const logUsage = () => supabase.rpc("log_ai_usage", {
      p_org_id: resolvedOrg, p_feature: "assistant", p_model: MODEL, p_in: asIn, p_out: asOut,
    }).then(() => {}, () => {});

    // Tool-calling loop (max 3 rounds).
    for (let round = 0; round < 3; round++) {
      const res = await fetch(OPENAI_API, {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, tool_choice: "auto", temperature: 0.2 }),
      });
      const data = await res.json();
      asIn += data.usage?.prompt_tokens || 0;
      asOut += data.usage?.completion_tokens || 0;
      const msg = data.choices?.[0]?.message;
      if (!msg) { logUsage(); return new Response(JSON.stringify({ error: "Sin respuesta de IA" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
      messages.push(msg);

      if (msg.tool_calls?.length) {
        for (const tc of msg.tool_calls) {
          let args: any = {};
          try { args = JSON.parse(tc.function.arguments || "{}"); } catch (_) { /* ignore */ }
          const { result, action: a } = await runTool(tc.function.name, args, supabase, resolvedOrg, user.id);
          if (a) action = a;
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        continue; // let the model read tool results and respond
      }

      // Final assistant text
      logUsage();
      return new Response(JSON.stringify({ reply: msg.content ?? "", action }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    logUsage();
    return new Response(JSON.stringify({ reply: "No pude completar la consulta, intenta reformularla.", action }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("crm-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
