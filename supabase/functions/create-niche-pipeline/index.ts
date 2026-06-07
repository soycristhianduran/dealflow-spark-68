/**
 * create-niche-pipeline
 *
 * Called at the end of onboarding to seed the org's first pipeline
 * with stages that match the business niche.
 *
 * Body: { niche: string, organization_id: string }
 *
 * Returns: { pipeline_id, stages[] } or { error }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Niche → pipeline template map ─────────────────────────────────────────────
// Each stage: { name, color (hex), probability (0-100) }
const NICHE_TEMPLATES: Record<string, {
  pipelineName: string;
  stages: { name: string; color: string; probability: number }[];
}> = {
  inmobiliaria: {
    pipelineName: "Pipeline Inmobiliario",
    stages: [
      { name: "Prospecto",           color: "#94a3b8", probability: 5  },
      { name: "Visita agendada",     color: "#60a5fa", probability: 20 },
      { name: "Visita realizada",    color: "#818cf8", probability: 40 },
      { name: "Oferta presentada",   color: "#f59e0b", probability: 60 },
      { name: "Negociación",         color: "#fb923c", probability: 80 },
      { name: "Cierre / Escritura",  color: "#22c55e", probability: 100},
    ],
  },
  seguros: {
    pipelineName: "Pipeline de Seguros",
    stages: [
      { name: "Lead nuevo",          color: "#94a3b8", probability: 5  },
      { name: "Contactado",          color: "#60a5fa", probability: 15 },
      { name: "Cotización enviada",  color: "#818cf8", probability: 35 },
      { name: "Propuesta formal",    color: "#f59e0b", probability: 60 },
      { name: "En suscripción",      color: "#fb923c", probability: 80 },
      { name: "Póliza activa",       color: "#22c55e", probability: 100},
    ],
  },
  agencia: {
    pipelineName: "Pipeline de Agencia",
    stages: [
      { name: "Lead",                color: "#94a3b8", probability: 5  },
      { name: "Discovery call",      color: "#60a5fa", probability: 25 },
      { name: "Propuesta enviada",   color: "#818cf8", probability: 50 },
      { name: "Negociación",         color: "#f59e0b", probability: 70 },
      { name: "Contrato firmado",    color: "#fb923c", probability: 90 },
      { name: "Onboarding",          color: "#22c55e", probability: 100},
    ],
  },
  salud: {
    pipelineName: "Pipeline Clínica / Salud",
    stages: [
      { name: "Consulta recibida",   color: "#94a3b8", probability: 10 },
      { name: "Cita agendada",       color: "#60a5fa", probability: 30 },
      { name: "Evaluación",          color: "#818cf8", probability: 50 },
      { name: "Plan de tratamiento", color: "#f59e0b", probability: 70 },
      { name: "En tratamiento",      color: "#fb923c", probability: 85 },
      { name: "Alta / Seguimiento",  color: "#22c55e", probability: 100},
    ],
  },
  ecommerce: {
    pipelineName: "Pipeline E-commerce / Retail",
    stages: [
      { name: "Interesado",          color: "#94a3b8", probability: 10 },
      { name: "Cotización",          color: "#60a5fa", probability: 25 },
      { name: "Demo / Muestra",      color: "#818cf8", probability: 45 },
      { name: "Pedido en proceso",   color: "#f59e0b", probability: 70 },
      { name: "Compra realizada",    color: "#22c55e", probability: 100},
    ],
  },
  tecnologia: {
    pipelineName: "Pipeline Tech / SaaS",
    stages: [
      { name: "MQL",                 color: "#94a3b8", probability: 5  },
      { name: "SQL",                 color: "#60a5fa", probability: 20 },
      { name: "Demo agendada",       color: "#818cf8", probability: 40 },
      { name: "Prueba / Trial",      color: "#f59e0b", probability: 60 },
      { name: "Propuesta enviada",   color: "#fb923c", probability: 80 },
      { name: "Cliente",             color: "#22c55e", probability: 100},
    ],
  },
  consultoria: {
    pipelineName: "Pipeline de Consultoría",
    stages: [
      { name: "Prospecto",           color: "#94a3b8", probability: 5  },
      { name: "Diagnóstico",         color: "#60a5fa", probability: 25 },
      { name: "Propuesta",           color: "#818cf8", probability: 50 },
      { name: "Negociación",         color: "#f59e0b", probability: 70 },
      { name: "Contrato",            color: "#fb923c", probability: 90 },
      { name: "Proyecto activo",     color: "#22c55e", probability: 100},
    ],
  },
  educacion: {
    pipelineName: "Pipeline Educación",
    stages: [
      { name: "Interesado",          color: "#94a3b8", probability: 10 },
      { name: "Información enviada", color: "#60a5fa", probability: 25 },
      { name: "Visita / Demo",       color: "#818cf8", probability: 45 },
      { name: "Inscripción",         color: "#f59e0b", probability: 70 },
      { name: "Matrícula pagada",    color: "#22c55e", probability: 100},
    ],
  },
  construccion: {
    pipelineName: "Pipeline Construcción",
    stages: [
      { name: "Solicitud recibida",  color: "#94a3b8", probability: 5  },
      { name: "Visita técnica",      color: "#60a5fa", probability: 20 },
      { name: "Presupuesto",         color: "#818cf8", probability: 45 },
      { name: "Aprobación",          color: "#f59e0b", probability: 65 },
      { name: "En obra",             color: "#fb923c", probability: 85 },
      { name: "Entrega",             color: "#22c55e", probability: 100},
    ],
  },
  general: {
    pipelineName: "Pipeline de Ventas",
    stages: [
      { name: "Lead",                color: "#94a3b8", probability: 5  },
      { name: "Contactado",          color: "#60a5fa", probability: 20 },
      { name: "Calificado",          color: "#818cf8", probability: 40 },
      { name: "Propuesta enviada",   color: "#f59e0b", probability: 65 },
      { name: "Negociación",         color: "#fb923c", probability: 85 },
      { name: "Ganado",              color: "#22c55e", probability: 100},
    ],
  },
};

// Map from onboarding industry labels → niche keys
function industryToNiche(industry: string): string {
  const map: Record<string, string> = {
    "Inmobiliaria":             "inmobiliaria",
    "Seguros":                  "seguros",
    "Marketing y Publicidad":   "agencia",
    "Salud":                    "salud",
    "Retail / Comercio":        "ecommerce",
    "Tecnología":               "tecnologia",
    "Consultoría":              "consultoria",
    "Educación":                "educacion",
    "Construcción":             "construccion",
    "Finanzas y Banca":         "general",
    "Manufactura":              "general",
    "Alimentos y Bebidas":      "general",
    "Legal":                    "consultoria",
    "Transporte y Logística":   "general",
    "Energía":                  "general",
    "Telecomunicaciones":       "tecnologia",
    "Agricultura":              "general",
    "Turismo y Hotelería":      "general",
    "Automotriz":               "general",
    "Entretenimiento":          "general",
    "Otro":                     "general",
  };
  return map[industry] ?? "general";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth check
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { niche: rawNiche, industry, organization_id } = body;

    if (!organization_id) throw new Error("organization_id es obligatorio");

    // Verify the caller is a member of the org
    const { data: member } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organization_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) throw new Error("No tienes acceso a esta organización");

    // Resolve niche key
    const nicheKey = rawNiche ?? (industry ? industryToNiche(industry) : "general");
    const template = NICHE_TEMPLATES[nicheKey] ?? NICHE_TEMPLATES["general"];

    // Check if org already has a pipeline — don't duplicate
    const { count: existingCount } = await supabase
      .from("pipelines")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization_id);

    if ((existingCount ?? 0) > 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "org_already_has_pipeline" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save niche to org
    await supabase
      .from("organizations")
      .update({ niche: nicheKey })
      .eq("id", organization_id);

    // Create the pipeline
    const { data: pipeline, error: pipelineErr } = await supabase
      .from("pipelines")
      .insert({
        name: template.pipelineName,
        organization_id,
      })
      .select("id, name")
      .single();

    if (pipelineErr || !pipeline) throw new Error("Error al crear pipeline: " + pipelineErr?.message);

    // Create all stages in order
    const stagesToInsert = template.stages.map((s, idx) => ({
      pipeline_id: pipeline.id,
      organization_id,
      name: s.name,
      color: s.color,
      probability: s.probability,
      order: idx,
    }));

    const { data: stages, error: stagesErr } = await supabase
      .from("pipeline_stages")
      .insert(stagesToInsert)
      .select("id, name, color, probability, order");

    if (stagesErr) throw new Error("Error al crear etapas: " + stagesErr.message);

    console.log(`[create-niche-pipeline] org=${organization_id} niche=${nicheKey} pipeline=${pipeline.id} stages=${stages?.length}`);

    return new Response(JSON.stringify({
      success: true,
      niche: nicheKey,
      pipeline_id: pipeline.id,
      pipeline_name: pipeline.name,
      stages: stages ?? [],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[create-niche-pipeline] error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
