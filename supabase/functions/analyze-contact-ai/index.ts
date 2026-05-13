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
function buildSystemPrompt(): string {
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

JSON schema:
{
  "temperature": <integer 0-100>,
  "sentiment": "positive" | "neutral" | "negative" | "mixed",
  "buying_intent": "high" | "medium" | "low" | "none",
  "signals_detected": <string[] max 5>,   // specific positive signals you saw (in Spanish)
  "objections": <string[] max 3>,         // specific objections raised
  "next_best_action": <string>,            // one concrete next action the sales rep should take
  "reasoning": <string>                    // 1-2 sentence justification of the temperature
}

Treat sarcasm, complaints, hostile messages, and price-shopping with no commitment as cold/warm at best.
Treat 'cuánto cuesta', 'me interesa', 'cuando podemos hablar', 'mándame info' as warm-to-hot signals.
Treat 'lo quiero', 'cuándo lo recibo', 'mándame el link de pago', 'ok lo compro' as ready-to-buy.`;
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
    const systemPrompt = buildSystemPrompt();
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
