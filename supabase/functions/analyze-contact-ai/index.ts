import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENAI_API = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";
const MAX_MESSAGES = 40;

/**
 * Prompts the LLM to analyze a lead's recent conversation and return a
 * strictly-typed JSON payload that we can store and combine with the
 * quantitative scoring system.
 */
interface PipelineStageHint {
  name: string;
  order: number;
  probability: number;
  is_current: boolean;
}

function buildSystemPrompt(pipelineHint: PipelineStageHint[] | null): string {
  const pipelineSection = pipelineHint && pipelineHint.length > 0
    ? `\n\nUSER'S PIPELINE STAGES (in order):\n${pipelineHint.map((s, i) =>
        `${i + 1}. "${s.name}" (close probability ${s.probability}%)${s.is_current ? '  ← CURRENT STAGE' : ''}`
      ).join('\n')}\n\nWhen suggesting a stage, return the EXACT name of one of the stages above in "suggested_stage_name".\nOnly suggest a stage that is LATER in the order than the current one.  If the lead is not ready to advance, return null.\nIf no current stage is marked, suggest the most appropriate stage based on the conversation.`
    : `\n\nThe user has not configured pipeline stages for this contact's deal.  Return "suggested_stage_name": null and focus on "next_best_action" and "suggested_task_title" instead.`;

  return `You are a Spanish-language sales lead analyzer for a B2B/B2C CRM. \
You read recent conversations between a business and a prospect, and return a single JSON object \
estimating how likely the prospect is to convert into a customer.

Output rules (STRICT):
- Output ONLY a valid JSON object — no markdown, no commentary, no code fences.
- All text fields in Spanish.
- "temperature" is an integer 0-100 indicating buying likelihood RIGHT NOW.
- Scale guidance:
    0-30   = cold (no interest, hostile, irrelevant, ghosted, complaint)
    31-60  = warm (some interest, asking general questions, no commitment yet)
    61-85  = hot (strong interest, asking specific questions about price/features/timing)
    86-100 = ready to buy (explicit purchase intent, asked for payment link, set timeline)
${pipelineSection}

JSON schema:
{
  "temperature": <integer 0-100>,
  "sentiment": "positive" | "neutral" | "negative" | "mixed",
  "buying_intent": "high" | "medium" | "low" | "none",
  "signals_detected": <string[] max 5>,
  "objections": <string[] max 3>,
  "next_best_action": <string>,
  "suggested_task_title": <string|null>,        // short (max 60 chars) actionable task title, or null if no urgent action
  "suggested_stage_name": <string|null>,         // EXACT name from the pipeline above, or null
  "suggested_stage_reasoning": <string|null>,    // 1 line WHY this stage, or null
  "reasoning": <string>                          // 1-2 sentence justification of the temperature
}

Treat sarcasm, complaints, hostile messages, and price-shopping with no commitment as cold/warm at best.
Treat 'cuánto cuesta', 'me interesa', 'cuando podemos hablar', 'mándame info' as warm-to-hot signals.
Treat 'lo quiero', 'cuándo lo recibo', 'mándame el link de pago', 'ok lo compro' as ready-to-buy.
For suggested_task_title use imperative voice ("Enviar propuesta", "Agendar llamada", "Mandar link de pago").`;
}

interface MsgRow {
  ts: string;
  direction: "incoming" | "outgoing";
  channel: string;
  body: string;
}

function formatMessagesForPrompt(messages: MsgRow[], contactName: string): string {
  const lines = messages.map((m) => {
    const who = m.direction === "incoming" ? `LEAD (${contactName})` : "EMPRESA";
    const date = new Date(m.ts).toISOString().slice(0, 16).replace("T", " ");
    return `[${date}] [${m.channel}] ${who}: ${m.body}`;
  });
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY no está configurada en los secrets de Supabase");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const { contact_id } = await req.json();
    if (!contact_id) throw new Error("contact_id es obligatorio");

    // ── Billing gate: check that the user's org has AI quota left ───────────
    // Resolves user_id → organization_id → consumes 1 credit. If the plan
    // budget is exhausted AND there are no AI Boost credits, returns 402
    // so the frontend can show the upgrade prompt.
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership?.organization_id) {
      throw new Error("No estás asociado a ninguna organización");
    }
    const orgId = membership.organization_id;
    const { data: hasQuota, error: quotaErr } = await supabase.rpc(
      "consume_ai_credit",
      { p_org_id: orgId, p_kind: "analyses", p_amount: 1 },
    );
    if (quotaErr) {
      console.error("consume_ai_credit RPC failed:", quotaErr);
      throw new Error("Error verificando cupo de IA");
    }
    if (!hasQuota) {
      return new Response(
        JSON.stringify({
          error: "Has alcanzado el límite mensual de análisis IA de tu plan. Upgrade tu plan o compra un AI Boost para continuar.",
          code: "ai_quota_exceeded",
        }),
        {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Load contact + recent messages ───────────────────────────────────────
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, full_name, status, primary_phone, primary_email, owner_id")
      .eq("id", contact_id)
      .maybeSingle();
    if (!contact) throw new Error("Contacto no encontrado");
    if (contact.owner_id && contact.owner_id !== user.id) {
      throw new Error("No tienes permiso sobre este contacto");
    }

    // ── Load pipeline stages context (most recent open deal of this contact) ─
    let pipelineHint: PipelineStageHint[] | null = null;
    let currentDealId: string | null = null;
    let currentStageId: string | null = null;
    let currentStageOrder = 0;
    try {
      const { data: openDeal } = await supabase
        .from("deals")
        .select("id, stage_id, pipeline_id")
        .eq("contact_id", contact_id)
        .not("status", "in", "(won,lost)")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (openDeal) {
        currentDealId = openDeal.id;
        currentStageId = openDeal.stage_id;

        const { data: stages } = await supabase
          .from("pipeline_stages")
          .select("id, name, order, probability")
          .eq("pipeline_id", openDeal.pipeline_id)
          .order("order", { ascending: true });

        if (stages && stages.length > 0) {
          pipelineHint = stages.map((s: any) => {
            const isCurrent = s.id === currentStageId;
            if (isCurrent) currentStageOrder = s.order;
            return {
              name: s.name,
              order: s.order,
              probability: s.probability || 0,
              is_current: isCurrent,
            };
          });
        }
      }
    } catch (e) {
      console.warn("Pipeline hint fetch failed (non-fatal):", e);
    }

    // WhatsApp messages
    const { data: waMessages } = await supabase
      .from("whatsapp_messages")
      .select("sent_at, direction, message_text, message_type")
      .eq("contact_id", contact_id)
      .order("sent_at", { ascending: false })
      .limit(MAX_MESSAGES);

    // Instagram messages (via instagram_conversations.contact_id)
    const { data: igMessages } = await supabase
      .from("instagram_messages")
      .select("sent_at, direction, message_text, message_type, conversation_id")
      .in("conversation_id",
        ((await supabase
          .from("instagram_conversations")
          .select("id")
          .eq("contact_id", contact_id)
        ).data || []).map((r: any) => r.id),
      )
      .order("sent_at", { ascending: false })
      .limit(MAX_MESSAGES);

    // Manual notes from activities
    const { data: noteActivities } = await supabase
      .from("activities")
      .select("created_at, event_type, summary")
      .eq("related_entity_id", contact_id)
      .eq("related_entity_type", "contact")
      .in("event_type", ["note", "call", "phone_call"])
      .order("created_at", { ascending: false })
      .limit(15);

    // Merge into a single chronological feed
    const merged: MsgRow[] = [];
    for (const m of waMessages || []) {
      if (!m.message_text || m.message_text.trim().length === 0) {
        // For media-only messages, give a hint instead of an empty body
        merged.push({
          ts: m.sent_at,
          direction: m.direction,
          channel: "WA",
          body: `[${m.message_type || "media"}]`,
        });
      } else {
        merged.push({
          ts: m.sent_at,
          direction: m.direction,
          channel: "WA",
          body: m.message_text.substring(0, 400),
        });
      }
    }
    for (const m of igMessages || []) {
      merged.push({
        ts: m.sent_at,
        direction: m.direction,
        channel: "IG",
        body: (m.message_text || `[${m.message_type || "media"}]`).substring(0, 400),
      });
    }
    for (const a of noteActivities || []) {
      merged.push({
        ts: a.created_at,
        direction: "outgoing",  // notes are written by the team
        channel: a.event_type === "note" ? "NOTA" : "LLAMADA",
        body: (a.summary || "").substring(0, 400),
      });
    }

    // Sort chronologically (oldest first so the model sees a story)
    merged.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

    // Trim to most recent N
    const trimmed = merged.slice(-MAX_MESSAGES);

    if (trimmed.length === 0) {
      // Nothing to analyze — return a neutral cold result
      const empty = {
        temperature: 10,
        sentiment: "neutral",
        buying_intent: "none",
        signals_detected: [],
        objections: [],
        next_best_action: "Iniciar primer contacto. No hay mensajes registrados todavía.",
        reasoning: "Contacto sin interacciones registradas. No hay base para análisis.",
      };
      await supabase.from("contact_ai_analyses").upsert(
        {
          contact_id,
          user_id: user.id,
          ...empty,
          messages_analyzed: 0,
          model_used: MODEL,
          tokens_used: 0,
          analyzed_at: new Date().toISOString(),
        },
        { onConflict: "contact_id" },
      );
      // Trigger score recalc
      await supabase.rpc("recalculate_contact_score", { contact_uuid: contact_id });
      return new Response(JSON.stringify({ success: true, analysis: empty }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const conversationText = formatMessagesForPrompt(trimmed, contact.full_name || "Lead");

    // ── Call OpenAI ───────────────────────────────────────────────────────────
    const systemPrompt = buildSystemPrompt(pipelineHint);
    const userPrompt = `Contact name: ${contact.full_name || "(sin nombre)"}\nStage: ${contact.status || "new"}\n\nRECENT CONVERSATION (chronological, oldest first):\n${conversationText}\n\nAnalyze the above and return the JSON object as specified.`;

    const openaiRes = await fetch(OPENAI_API, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    const openaiData = await openaiRes.json();
    if (!openaiRes.ok) {
      console.error("OpenAI error:", JSON.stringify(openaiData));
      throw new Error(`OpenAI: ${openaiData.error?.message || "unknown error"}`);
    }

    const rawContent = openaiData.choices?.[0]?.message?.content;
    if (!rawContent) throw new Error("OpenAI no devolvió contenido");

    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch (_) {
      throw new Error("OpenAI devolvió JSON inválido: " + rawContent.substring(0, 200));
    }

    // ── Validate & clamp the structured output ────────────────────────────────
    const temperature = Math.max(0, Math.min(100, parseInt(parsed.temperature) || 0));
    const sentiment = ["positive", "neutral", "negative", "mixed"].includes(parsed.sentiment)
      ? parsed.sentiment : "neutral";
    const buying_intent = ["high", "medium", "low", "none"].includes(parsed.buying_intent)
      ? parsed.buying_intent : "none";
    const signals = Array.isArray(parsed.signals_detected)
      ? parsed.signals_detected.slice(0, 5).map((s: any) => String(s).substring(0, 200)) : [];
    const objections = Array.isArray(parsed.objections)
      ? parsed.objections.slice(0, 3).map((s: any) => String(s).substring(0, 200)) : [];
    const next_best_action = String(parsed.next_best_action || "").substring(0, 500);
    const reasoning = String(parsed.reasoning || "").substring(0, 500);
    const suggested_task_title = parsed.suggested_task_title
      ? String(parsed.suggested_task_title).substring(0, 100)
      : null;

    // ── Validate suggested stage against the pipeline we sent ────────────────
    let suggested_stage_id: string | null = null;
    let suggested_stage_reasoning: string | null = null;
    if (parsed.suggested_stage_name && pipelineHint) {
      const suggestedName = String(parsed.suggested_stage_name).trim();
      const match = pipelineHint.find((s) => s.name.toLowerCase() === suggestedName.toLowerCase());
      if (match) {
        // VALIDATION A: name exists in the user's pipeline ✓
        // VALIDATION B: only allow forward moves (higher order than current)
        if (match.order > currentStageOrder) {
          // Look up the actual stage_id from the user's deal's pipeline
          const { data: stage } = await supabase
            .from("pipeline_stages")
            .select("id")
            .eq("name", match.name)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (stage) {
            suggested_stage_id = stage.id;
            suggested_stage_reasoning = parsed.suggested_stage_reasoning
              ? String(parsed.suggested_stage_reasoning).substring(0, 300)
              : null;
          }
        } else {
          console.log(`Skipping stage suggestion "${suggestedName}" — not forward (order ${match.order} <= current ${currentStageOrder})`);
        }
      } else {
        console.log(`LLM hallucinated stage "${suggestedName}" — not in pipeline, ignoring`);
      }
    }

    // ── Optionally create a task from suggested_task_title (only if hot) ─────
    let suggested_task_created_id: string | null = null;
    if (suggested_task_title && temperature >= 50) {
      // Don't duplicate: only create if no pending AI-source task already exists for this contact
      const { data: existing } = await supabase
        .from("tasks")
        .select("id")
        .eq("contact_id", contact_id)
        .eq("source", "ai_suggestion")
        .eq("status", "pending")
        .maybeSingle();
      if (!existing) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 1); // +24h
        const { data: newTask } = await supabase
          .from("tasks")
          .insert({
            title: suggested_task_title,
            description: `Generada por IA. ${next_best_action}`,
            task_type: "follow_up",
            priority: temperature >= 80 ? "high" : "medium",
            due_date: dueDate.toISOString().slice(0, 10),
            status: "pending",
            owner_id: contact.owner_id || user.id,
            contact_id,
            deal_id: currentDealId,
            source: "ai_suggestion",
          })
          .select("id")
          .single();
        suggested_task_created_id = newTask?.id ?? null;
      }
    }

    // ── Persist ──────────────────────────────────────────────────────────────
    const { error: insertErr } = await supabase
      .from("contact_ai_analyses")
      .upsert(
        {
          contact_id,
          user_id: user.id,
          temperature,
          sentiment,
          buying_intent,
          signals_detected: signals,
          objections,
          next_best_action,
          reasoning,
          suggested_stage_id,
          suggested_stage_reasoning,
          suggested_task_title,
          suggested_task_created_id,
          messages_analyzed: trimmed.length,
          model_used: MODEL,
          tokens_used: openaiData.usage?.total_tokens || 0,
          analyzed_at: new Date().toISOString(),
        },
        { onConflict: "contact_id" },
      );
    if (insertErr) throw new Error("Error guardando análisis: " + insertErr.message);

    // ── Trigger hybrid score recalc (now blends AI + quantitative) ───────────
    const { data: newScore } = await supabase.rpc("recalculate_contact_score", {
      contact_uuid: contact_id,
    });

    return new Response(JSON.stringify({
      success: true,
      analysis: {
        temperature, sentiment, buying_intent,
        signals_detected: signals,
        objections,
        next_best_action,
        reasoning,
        suggested_stage_id,
        suggested_stage_reasoning,
        suggested_task_title,
        suggested_task_created_id,
        messages_analyzed: trimmed.length,
        tokens_used: openaiData.usage?.total_tokens || 0,
      },
      new_contact_score: newScore,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("analyze-contact-ai error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
