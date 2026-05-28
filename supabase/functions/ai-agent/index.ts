/**
 * ai-agent — 24/7 conversational AI agent for WhatsApp, Instagram & Messenger.
 *
 * Called by channel webhooks (whatsapp-webhook, facebook-webhook) when a new
 * inbound message arrives. Returns the agent's response text (or null if the
 * agent is disabled / paused / out of credits).
 *
 * Billing unit: 1 conversation credit per (org, channel, session_key) per day.
 * The consume_ai_agent_session RPC handles the atomic upsert + counter.
 *
 * Media handling:
 *   - text   → sent directly to Claude Haiku
 *   - image  → sent to Claude Haiku with vision (URL or base64)
 *   - audio  → transcribed via OpenAI Whisper, then sent as text
 *   - other  → agent says it can't process and offers to escalate
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const WHISPER_API   = "https://api.openai.com/v1/audio/transcriptions";

// Keywords that trigger automatic escalation to a human agent
const ESCALATION_TRIGGERS = [
  "quiero hablar con una persona",
  "quiero hablar con un humano",
  "quiero un asesor",
  "hablar con un agente",
  "quiero comprar",
  "quiero adquirir",
  "me interesa comprar",
  "cuándo me pueden llamar",
  "cuando me pueden llamar",
  "llamen me",
  "llámeme",
  "llamada",
];

function buildSystemPrompt(cfg: any): string {
  const tone = cfg.tone === "formal"
    ? "Usa un tono profesional y formal."
    : cfg.tone === "casual"
    ? "Usa un tono casual y relajado, como si hablaras con un amigo."
    : "Usa un tono amigable, cálido y cercano.";

  return `Eres ${cfg.agent_name || "Asistente"}, el asistente virtual de ${cfg.business_name || "nuestra empresa"}.
Tu rol es atender consultas de clientes por ${["WhatsApp", "Instagram", "Messenger"].join("/")} de forma rápida y útil.

${tone}

${cfg.business_description ? `SOBRE EL NEGOCIO:\n${cfg.business_description}\n` : ""}
${cfg.products ? `PRODUCTOS Y SERVICIOS:\n${cfg.products}\n` : ""}
${cfg.faqs ? `PREGUNTAS FRECUENTES:\n${cfg.faqs}\n` : ""}

REGLAS IMPORTANTES:
1. Responde siempre en el idioma en que te escriben.
2. Sé conciso — respuestas cortas y directas (máximo 3-4 líneas por mensaje).
3. Si no sabes algo o el tema está fuera de tu alcance, responde: "${cfg.off_topic_response || "Lo siento, no tengo información sobre ese tema. Un asesor te ayudará en breve."}"
4. NUNCA inventes precios, fechas ni datos que no tengas.
5. Si el usuario quiere hablar con una persona o muestra intención clara de compra, responde EXACTAMENTE con este texto (sin modificarlo): ESCALAR_A_HUMANO
6. No menciones que eres una IA a menos que te lo pregunten directamente.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const {
      channel,          // 'whatsapp' | 'instagram' | 'messenger'
      organization_id,
      user_id,
      contact_id,
      session_key,      // phone number or conversation id
      message,          // { type, content, media_url? }
      recent_messages,  // last N messages [{role, content}] for context
    } = await req.json();

    if (!channel || !organization_id || !session_key || !message) {
      return json({ error: "Missing required fields" }, 400);
    }

    // 1. Load agent config
    const { data: cfg } = await supabase
      .from("ai_agent_configs")
      .select("*")
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (!cfg?.is_active) {
      return json({ response: null, reason: "agent_inactive" });
    }

    // 2. Check if this channel is enabled
    const channels = cfg.channels || {};
    if (!channels[channel]) {
      return json({ response: null, reason: "channel_disabled" });
    }

    // 3. Check if conversation is paused (human took over)
    const { data: paused } = await supabase
      .from("ai_agent_paused")
      .select("paused_at")
      .eq("organization_id", organization_id)
      .eq("channel", channel)
      .eq("session_key", session_key)
      .maybeSingle();

    if (paused) {
      return json({ response: null, reason: "conversation_paused" });
    }

    // 4. Check escalation keywords in user message BEFORE calling AI
    const msgLower = (message.content || "").toLowerCase();
    const shouldEscalate = ESCALATION_TRIGGERS.some(t => msgLower.includes(t));
    if (shouldEscalate) {
      await markEscalated(supabase, organization_id, channel, session_key);
      return json({
        response: cfg.escalation_response,
        escalated: true,
        reason: "escalation_keyword",
      });
    }

    // 5. Consume session credit (billing)
    const { data: sessionData, error: sessionErr } = await supabase.rpc(
      "consume_ai_agent_session",
      { p_org_id: organization_id, p_channel: channel, p_session_key: session_key },
    );
    if (sessionErr) {
      console.error("consume_ai_agent_session error:", sessionErr.message);
      // Non-fatal — continue anyway to not block the user experience
    }

    // 6. Prepare user message content for Claude
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    let userContent: any;

    if (message.type === "audio" || message.type === "voice") {
      // Transcribe audio with Whisper
      const transcript = await transcribeAudio(message.media_url, ANTHROPIC_API_KEY);
      userContent = transcript
        ? `[Nota de voz]: ${transcript}`
        : "[Nota de voz recibida — no pude transcribirla]";

    } else if (message.type === "image") {
      // Send image to Claude vision
      userContent = [
        {
          type: "image",
          source: { type: "url", url: message.media_url },
        },
        {
          type: "text",
          text: message.content
            ? message.content
            : "¿Qué ves en esta imagen?",
        },
      ];

    } else if (["video", "document", "sticker"].includes(message.type)) {
      // Unsupported media type — respond and offer escalation
      return json({
        response: "Recibí tu archivo, pero aún no puedo procesar ese tipo de contenido. ¿Te comunico con un asesor para que te ayude? 😊",
        escalated: false,
      });

    } else {
      // Plain text (or reaction, button tap, etc.)
      userContent = message.content || "(mensaje vacío)";
    }

    // 7. Build conversation history for Claude (last 6 exchanges max)
    const history: { role: string; content: any }[] = [];
    if (Array.isArray(recent_messages)) {
      for (const m of recent_messages.slice(-6)) {
        history.push({ role: m.role, content: m.content });
      }
    }
    history.push({ role: "user", content: userContent });

    // 8. Call Claude Haiku
    const claudeRes = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 512,
        system: buildSystemPrompt(cfg),
        messages: history,
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error(`Claude API error ${claudeRes.status}: ${errText}`);
    }

    const claudeData = await claudeRes.json();
    let aiText: string = claudeData.content?.[0]?.text?.trim() || "";

    // 9. Detect AI-initiated escalation (model returned the sentinel)
    if (aiText.includes("ESCALAR_A_HUMANO")) {
      await markEscalated(supabase, organization_id, channel, session_key);
      return json({
        response: cfg.escalation_response,
        escalated: true,
        reason: "ai_escalation",
      });
    }

    return json({ response: aiText, escalated: false });

  } catch (err: any) {
    console.error("ai-agent error:", err);
    return json({ error: err.message }, 500);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function markEscalated(
  supabase: any,
  orgId: string,
  channel: string,
  sessionKey: string,
) {
  // Pause AI for this conversation so the human can take over
  await supabase.from("ai_agent_paused").upsert({
    organization_id: orgId,
    channel,
    session_key: sessionKey,
    paused_at: new Date().toISOString(),
  }, { onConflict: "organization_id,channel,session_key" });

  // Mark session as escalated for reporting
  await supabase
    .from("ai_agent_sessions")
    .update({ was_escalated: true })
    .eq("organization_id", orgId)
    .eq("channel", channel)
    .eq("session_key", sessionKey)
    .eq("date_utc", new Date().toISOString().slice(0, 10));
}

async function transcribeAudio(mediaUrl: string | null, anthropicKey: string): Promise<string | null> {
  if (!mediaUrl) return null;

  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY not set — cannot transcribe audio");
    return null;
  }

  try {
    // Download the audio file
    const audioRes = await fetch(mediaUrl);
    if (!audioRes.ok) {
      console.error("Failed to download audio:", audioRes.status);
      return null;
    }

    const audioBlob = await audioRes.blob();
    const ext = mediaUrl.split(".").pop()?.split("?")[0] || "ogg";
    const mimeType = audioBlob.type || "audio/ogg";

    const form = new FormData();
    form.append("file", new File([audioBlob], `audio.${ext}`, { type: mimeType }));
    form.append("model", "whisper-1");
    form.append("language", "es"); // default to Spanish; Whisper auto-detects if wrong

    const whisperRes = await fetch(WHISPER_API, {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
      body: form,
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.text();
      console.error("Whisper error:", whisperRes.status, err);
      return null;
    }

    const { text } = await whisperRes.json();
    return text || null;

  } catch (e) {
    console.error("transcribeAudio error:", e);
    return null;
  }
}
