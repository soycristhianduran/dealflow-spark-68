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

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABELS: Record<string, string> = {
  mon: "Lunes", tue: "Martes", wed: "Miércoles", thu: "Jueves",
  fri: "Viernes", sat: "Sábado", sun: "Domingo",
};

// Human-readable working-hours summary for the prompt.
function workingHoursSummary(wh: any): string {
  if (!wh) return "Lun-Vie 09:00-18:00";
  const parts: string[] = [];
  for (const k of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) {
    const d = wh[k];
    if (d?.enabled) parts.push(`${DAY_LABELS[k]} ${d.start}-${d.end}`);
  }
  return parts.length ? parts.join(", ") : "Sin horario configurado";
}

function buildSystemPrompt(cfg: any, opts: { nowBogota: string; canBook: boolean; media: any[] }): string {
  const tone = cfg.tone === "formal"
    ? "Usa un tono profesional y formal."
    : cfg.tone === "casual"
    ? "Usa un tono casual y relajado, como si hablaras con un amigo."
    : "Usa un tono amigable, cálido y cercano.";

  const bookingBlock = opts.canBook
    ? `\nAGENDAMIENTO DE CITAS:
- Puedes agendar citas usando la herramienta book_appointment.
- Fecha y hora actual (Colombia): ${opts.nowBogota}.
- Horario de atención: ${workingHoursSummary(cfg.working_hours)}. Duración de cada cita: ${cfg.appointment_duration_min || 30} minutos.
- Solo ofrece y agenda horarios dentro del horario de atención y en el futuro.
- Antes de agendar, confirma con el cliente la fecha y hora exactas. Cuando confirme, llama a book_appointment con la fecha/hora en formato ISO (ej. 2026-06-20T15:00:00).
- Si la herramienta devuelve un conflicto o error, ofrece otra hora.\n`
    : "";

  const mediaBlock = opts.media.length
    ? `\nARCHIVOS QUE PUEDES ENVIAR (usa la herramienta send_media con el id correspondiente cuando sea útil):
${opts.media.map((m) => `- id: ${m.id} | ${m.name}${m.description ? ` — ${m.description}` : ""}`).join("\n")}\n`
    : "";

  return `Eres ${cfg.agent_name || "Asistente"}, el asistente virtual de ${cfg.business_name || "nuestra empresa"}.
Tu rol es atender consultas de clientes por ${["WhatsApp", "Instagram", "Messenger"].join("/")} de forma rápida y útil.

${tone}

${cfg.business_description ? `SOBRE EL NEGOCIO:\n${cfg.business_description}\n` : ""}
${cfg.products ? `PRODUCTOS Y SERVICIOS:\n${cfg.products}\n` : ""}
${cfg.faqs ? `PREGUNTAS FRECUENTES:\n${cfg.faqs}\n` : ""}
${bookingBlock}${mediaBlock}
REGLAS IMPORTANTES:
1. Responde siempre en el idioma en que te escriben.
2. Sé conciso. Cada idea en una oración clara. Máximo 2-3 oraciones por párrafo.
3. Si tu respuesta necesita más de un punto, separa cada punto con una línea en blanco (\\n\\n). Cada bloque separado se enviará como un mensaje independiente. Usa máximo 3 bloques.
4. Si no sabes algo o el tema está fuera de tu alcance, responde: "${cfg.off_topic_response || "Lo siento, no tengo información sobre ese tema. Un asesor te ayudará en breve."}"
5. NUNCA inventes precios, fechas ni datos que no tengas.
6. Si el usuario quiere hablar con una persona o muestra intención clara de compra, responde EXACTAMENTE con este texto (sin modificarlo): ESCALAR_A_HUMANO
7. No menciones que eres una IA a menos que te lo pregunten directamente.`;
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
    // Auto-reactivate after 24 hours — prevents conversations from being
    // permanently silenced if the human never explicitly reactivated the agent.
    const { data: paused } = await supabase
      .from("ai_agent_paused")
      .select("paused_at")
      .eq("organization_id", organization_id)
      .eq("channel", channel)
      .eq("session_key", session_key)
      .maybeSingle();

    if (paused) {
      const pausedAt = new Date(paused.paused_at).getTime();
      const hoursSincePause = (Date.now() - pausedAt) / 3_600_000;

      if (hoursSincePause < 24) {
        // Still within the 24h human takeover window
        return json({ response: null, reason: "conversation_paused" });
      } else {
        // 24h elapsed → auto-reactivate the agent for this conversation
        await supabase
          .from("ai_agent_paused")
          .delete()
          .eq("organization_id", organization_id)
          .eq("channel", channel)
          .eq("session_key", session_key);
        console.log(`[AI-AGENT] Auto-reactivated after ${Math.round(hoursSincePause)}h pause for session ${session_key}`);
      }
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

    // 5. Consume session credit (billing) — enforces monthly quota + add-on overflow
    const { data: sessionData, error: sessionErr } = await supabase.rpc(
      "consume_ai_agent_session",
      { p_org_id: organization_id, p_channel: channel, p_session_key: session_key },
    );
    if (sessionErr) {
      console.error("consume_ai_agent_session error:", sessionErr.message);
      // Non-fatal — continue anyway to not block the user experience
    }
    if (sessionData?.quota_exceeded) {
      return json({ response: null, reason: "quota_exceeded" });
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

    // 7. Load media library + resolve which calendar to book into
    const { data: mediaRows } = await supabase
      .from("agent_media")
      .select("id, name, description, file_url, file_type, mime")
      .eq("organization_id", organization_id)
      .eq("is_active", true);
    const mediaList = mediaRows || [];
    const mediaById = new Map(mediaList.map((m: any) => [m.id, m]));

    const advisorUserId = cfg.appointments_enabled
      ? await resolveAdvisor(supabase, organization_id, contact_id)
      : null;
    const canBook = !!(cfg.appointments_enabled && advisorUserId);

    const nowBogota = new Intl.DateTimeFormat("es-CO", {
      timeZone: "America/Bogota", dateStyle: "full", timeStyle: "short",
    }).format(new Date());

    // 8. Build tools available to the agent
    const tools: any[] = [];
    if (canBook) {
      tools.push({
        name: "book_appointment",
        description: "Agenda una cita/reunión con el cliente en el calendario. Úsala SOLO cuando el cliente ya confirmó fecha y hora.",
        input_schema: {
          type: "object",
          properties: {
            datetime_iso: { type: "string", description: "Fecha y hora de inicio en ISO 8601, hora de Colombia. Ej: 2026-06-20T15:00:00" },
            title: { type: "string", description: "Título corto de la cita. Ej: Cita con Juan Pérez" },
            notes: { type: "string", description: "Notas o tema de la cita (opcional)" },
          },
          required: ["datetime_iso"],
        },
      });
    }
    if (mediaList.length) {
      tools.push({
        name: "send_media",
        description: "Envía al cliente uno de los archivos disponibles (imagen o PDF) por el chat. Úsala cuando el archivo ayude a la conversación.",
        input_schema: {
          type: "object",
          properties: {
            media_id: { type: "string", description: "El id del archivo a enviar (de la lista de archivos disponibles)." },
          },
          required: ["media_id"],
        },
      });
    }

    // 9. Build conversation history (last 6 exchanges) + current message
    const history: { role: string; content: any }[] = [];
    if (Array.isArray(recent_messages)) {
      for (const m of recent_messages.slice(-6)) {
        history.push({ role: m.role, content: m.content });
      }
    }
    history.push({ role: "user", content: userContent });

    const system = buildSystemPrompt(cfg, { nowBogota, canBook, media: mediaList });
    const mediaToSend: any[] = [];
    let aiText = "";

    // 10. Tool-calling loop (max 4 turns to allow book + send + reply)
    for (let turn = 0; turn < 4; turn++) {
      const claudeRes = await fetch(ANTHROPIC_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 700,
          system,
          messages: history,
          ...(tools.length ? { tools } : {}),
        }),
      });
      if (!claudeRes.ok) {
        const errText = await claudeRes.text();
        throw new Error(`Claude API error ${claudeRes.status}: ${errText}`);
      }
      const claudeData = await claudeRes.json();
      const blocks: any[] = claudeData.content || [];
      aiText = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n\n").trim();

      if (claudeData.stop_reason !== "tool_use") break;

      // Execute each requested tool and feed results back
      history.push({ role: "assistant", content: blocks });
      const toolResults: any[] = [];
      for (const b of blocks) {
        if (b.type !== "tool_use") continue;
        let resultText = "";
        try {
          if (b.name === "book_appointment") {
            resultText = await bookAppointment(supabase, {
              organization_id, advisorUserId: advisorUserId!, contact_id,
              durationMin: cfg.appointment_duration_min || 30,
              workingHours: cfg.working_hours,
              input: b.input,
            });
          } else if (b.name === "send_media") {
            const m = mediaById.get(b.input?.media_id);
            if (!m) { resultText = "No existe ese archivo."; }
            else {
              mediaToSend.push({ type: m.file_type === "document" ? "document" : "image", link: m.file_url, filename: m.name });
              resultText = `Archivo "${m.name}" se enviará al cliente.`;
            }
          } else {
            resultText = "Herramienta desconocida.";
          }
        } catch (e: any) {
          resultText = `Error: ${e?.message || "no se pudo completar"}`;
        }
        toolResults.push({ type: "tool_result", tool_use_id: b.id, content: resultText });
      }
      history.push({ role: "user", content: toolResults });
    }

    // 11. Detect AI-initiated escalation (model returned the sentinel)
    if (aiText.includes("ESCALAR_A_HUMANO")) {
      await markEscalated(supabase, organization_id, channel, session_key);
      return json({
        response: cfg.escalation_response,
        escalated: true,
        reason: "ai_escalation",
      });
    }

    return json({ response: aiText, escalated: false, media: mediaToSend });

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

// Pick whose Google Calendar to book into: the contact's assigned advisor if
// they connected Google Calendar, otherwise any org member (owner first) who has.
async function resolveAdvisor(supabase: any, orgId: string, contactId: string | null): Promise<string | null> {
  const hasToken = async (uid: string | null): Promise<boolean> => {
    if (!uid) return false;
    const { data } = await supabase.from("google_calendar_tokens").select("user_id").eq("user_id", uid).maybeSingle();
    return !!data;
  };

  // 1. The contact's assigned owner
  if (contactId) {
    const { data: c } = await supabase.from("contacts").select("owner_id").eq("id", contactId).maybeSingle();
    if (c?.owner_id && await hasToken(c.owner_id)) return c.owner_id;
  }

  // 2. Fallback: any org member with a connected calendar (owner/admin first)
  const { data: members } = await supabase
    .from("organization_members").select("user_id, role").eq("organization_id", orgId);
  if (!members?.length) return null;
  const ordered = [...members].sort((a: any, b: any) => {
    const rank = (r: string) => (r === "owner" ? 0 : r === "admin" ? 1 : 2);
    return rank(a.role) - rank(b.role);
  });
  for (const m of ordered) {
    if (await hasToken(m.user_id)) return m.user_id;
  }
  return null;
}

const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// Validate the requested slot against working hours, create the meeting row and
// the Google Calendar event. Returns a short result string for the model.
async function bookAppointment(
  supabase: any,
  args: {
    organization_id: string; advisorUserId: string; contact_id: string | null;
    durationMin: number; workingHours: any; input: any;
  },
): Promise<string> {
  const { organization_id, advisorUserId, contact_id, durationMin, workingHours, input } = args;
  const iso: string = input?.datetime_iso;
  if (!iso) return "Falta la fecha/hora.";

  // Interpret the ISO as Bogota local time (UTC-5, no DST).
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return "Formato de fecha inválido. Usa ISO 8601, ej: 2026-06-20T15:00:00.";
  const [_, y, mo, d, hh, mm] = m;
  const startUtc = new Date(Date.UTC(+y, +mo - 1, +d, +hh + 5, +mm)); // Bogota = UTC-5
  if (isNaN(startUtc.getTime())) return "Fecha inválida.";
  if (startUtc.getTime() <= Date.now()) return "Esa fecha ya pasó. Ofrece una fecha futura.";

  // Working-hours check (using Bogota wall-clock from the input)
  const dowKey = DOW[new Date(Date.UTC(+y, +mo - 1, +d)).getUTCDay()];
  const wh = workingHours?.[dowKey];
  if (!wh?.enabled) return `No se atiende ese día (${dowKey}). Ofrece un día dentro del horario.`;
  const minutes = +hh * 60 + +mm;
  const [sH, sM] = String(wh.start || "09:00").split(":").map(Number);
  const [eH, eM] = String(wh.end || "18:00").split(":").map(Number);
  if (minutes < sH * 60 + sM || minutes + durationMin > eH * 60 + eM) {
    return `Esa hora está fuera del horario de atención (${wh.start}-${wh.end}). Ofrece otra hora.`;
  }

  const endUtc = new Date(startUtc.getTime() + durationMin * 60000);

  // Contact info for the title/attendee
  let contactName = "Cliente";
  let contactEmail: string | null = null;
  if (contact_id) {
    const { data: c } = await supabase.from("contacts")
      .select("full_name, primary_email").eq("id", contact_id).maybeSingle();
    contactName = c?.full_name || contactName;
    contactEmail = c?.primary_email || null;
  }
  const title = (input?.title || `Cita con ${contactName}`).slice(0, 120);
  const notes = input?.notes || null;

  // Insert the meeting row (CRM)
  const { data: meeting, error: mErr } = await supabase.from("meetings").insert({
    organization_id, contact_id, advisor_id: advisorUserId,
    title, start_at: startUtc.toISOString(), end_at: endUtc.toISOString(),
    timezone: "America/Bogota", status: "scheduled", meeting_type: "video_call",
    notes,
  }).select("id").single();
  if (mErr) return `No se pudo guardar la cita: ${mErr.message}`;

  // Create the Google Calendar event (best-effort)
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/create-calendar-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        action: "create", user_id: advisorUserId, title,
        description: notes || `Cita agendada por el asistente virtual con ${contactName}.`,
        start_at: startUtc.toISOString(), end_at: endUtc.toISOString(),
        attendee_email: contactEmail || undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body?.google_event_id) {
      await supabase.from("meetings").update({ google_event_id: body.google_event_id }).eq("id", meeting.id);
    }
  } catch (e) {
    console.warn("[ai-agent] gcal create failed:", e);
  }

  const when = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota", dateStyle: "full", timeStyle: "short",
  }).format(startUtc);
  return `Cita agendada correctamente para ${when}. Confírmasela al cliente con esa fecha y hora.`;
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
