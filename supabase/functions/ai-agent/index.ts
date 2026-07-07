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

function buildSystemPrompt(cfg: any, opts: { nowBogota: string; upcomingDates: string; canBook: boolean; media: any[]; contactEmail?: string | null; contactMemory?: string | null; orgTags?: string[]; stages?: string[]; upcomingMeeting?: any; autoPipeline?: boolean }): string {
  const tone = cfg.tone === "formal"
    ? "Usa un tono profesional y formal."
    : cfg.tone === "casual"
    ? "Usa un tono casual y relajado, como si hablaras con un amigo."
    : "Usa un tono amigable, cálido y cercano.";

  // Regional language adaptation — keep the agent from sounding like the wrong
  // country (e.g. Mexican slang "¿te late?" for a Colombian business).
  const regionBlock = cfg.region
    ? `IDIOMA Y REGIÓN: Comunícate en español natural de ${cfg.region}. Usa el trato y las expresiones propias de ${cfg.region}. NO uses modismos de OTROS países; por ejemplo, si la región NO es México evita mexicanismos como "¿te late?", "órale", "qué onda", "chido". Mantén un español profesional y cercano, apropiado para ${cfg.region}.`
    : `IDIOMA: Usa español latinoamericano NEUTRO y profesional. Evita modismos muy regionales (mexicanismos, argentinismos, etc.) para que suene natural en cualquier país.`;

  const bookingBlock = opts.canBook
    ? `\nAGENDAMIENTO DE CITAS:
- Puedes agendar citas usando la herramienta book_appointment.
- Fecha y hora actual (Colombia): ${opts.nowBogota}.
- CALENDARIO DE REFERENCIA (usa EXACTAMENTE estas fechas para mapear los días que mencione el cliente):
${opts.upcomingDates}
- Cuando el cliente diga un día (ej. "miércoles"), busca su fecha EXACTA en el calendario de referencia de arriba. No la calcules de memoria.
- Horario de atención: ${workingHoursSummary(cfg.working_hours)}. Duración de cada cita: ${cfg.appointment_duration_min || 30} minutos.
- ⛔ DISPONIBILIDAD REAL (REGLA ABSOLUTA): NUNCA digas ni una sola hora sin haber llamado a check_availability en este mismo turno. La ÚNICA fuente de horarios es lo que devuelva esa herramienta. Está PROHIBIDO inventar, suponer o "rellenar" horas de memoria o del horario de atención. Ofrece EXACTAMENTE y SOLO las horas que devuelva check_availability, tal cual (ni una más ni una menos). Si el cliente pide una hora concreta, llama check_availability para ESE día y confirma si esa hora está en la lista devuelta: si está, es válida; si NO está en la lista, entonces sí está ocupada. Si la herramienta devuelve que no hay horarios ese día, dilo tal cual y ofrece otro día — jamás fabriques una lista.
${
  cfg.appointment_modality === "virtual"
    ? "- TODAS las citas son VIRTUALES. NO preguntes modalidad. Siempre agenda con mode=virtual (se genera un enlace de Google Meet)."
    : cfg.appointment_modality === "presencial"
    ? `- TODAS las citas son PRESENCIALES en: "${cfg.meeting_address || "(dirección no configurada — pídela al cliente)"}". NO preguntes modalidad. Agenda con mode=presencial.`
    : `- Pregunta si la reunión será VIRTUAL (enlace de Google Meet) o PRESENCIAL.${cfg.meeting_address ? ` Si es presencial, la dirección del negocio es: "${cfg.meeting_address}" (úsala automáticamente, no la pidas).` : " Si es presencial, pídele al cliente la dirección."}`
}
- CORREO para la invitación:${opts.contactEmail ? ` ya tenemos registrado el correo "${opts.contactEmail}". NO lo pidas de nuevo: confírmalo con el cliente ("¿Te envío la invitación a ${opts.contactEmail}?"). Si lo confirma, pásalo en client_email. Si dice que es otro, usa el nuevo.` : ` no tenemos su correo. Pídeselo para enviarle la invitación (si no quiere darlo, agenda igual pero avísale que sin correo no recibirá la invitación por email).`}
- Antes de agendar, confirma con el cliente la fecha y hora exactas (di el día y la fecha, ej. "miércoles 17 de junio a las 3pm"). Cuando confirme, llama a book_appointment con datetime_iso, mode (virtual/presencial), address (si aplica) y client_email (si lo tienes).
- Tras agendar, comparte con el cliente el enlace de Meet (si es virtual) o la dirección (si es presencial).
- Si book_appointment devuelve que la hora está ocupada, vuelve a llamar check_availability y ofrece otra hora libre.

${cfg.appointments_paid ? `\n💳 CITAS CON PAGO PREVIO: las citas de este negocio REQUIEREN pago antes de agendar.
${cfg.payment_info ? `- Precios/servicios:\n${cfg.payment_info}` : ""}
${cfg.payment_link ? `- Links/métodos de pago (puede haber varios; envía SOLO el que corresponda al servicio o método que pida el cliente):\n${cfg.payment_link}` : ""}
${cfg.payment_account_info ? `- Datos de la cuenta que debe recibir el pago: ${cfg.payment_account_info}` : ""}
- Flujo: 1) confirma disponibilidad y el horario que quiere el cliente. 2) ANTES de pedir el pago, recopila y guarda el NOMBRE COMPLETO y el CORREO del cliente (con update_lead) — esto es obligatorio para poder agendar después sin volver a pedirlo. 3) Dile el precio que corresponde${cfg.payment_link ? " y envíale el link de pago correcto (el del servicio/método elegido)" : ""}. ${
  cfg.require_payment_proof
    ? `4) Pídele que te envíe el COMPROBANTE de pago (captura o foto). 5) Cuando envíe la imagen, REVÍSALA con cuidado: verifica que (a) sea realmente un comprobante de pago/transferencia, (b) el VALOR pagado coincida con el precio del servicio${cfg.payment_account_info ? ", (c) el pago vaya a la cuenta correcta indicada arriba" : ""}, y que no se vea alterada/editada. 6) Si todo cuadra, agenda de INMEDIATO con book_appointment payment_confirmed=true (ya tienes nombre y correo del paso 2 — NO los vuelvas a pedir). 7) Si el monto NO coincide, no es un comprobante, o algo no cuadra, NO agendes: explícale al cliente qué falta y pídele el comprobante correcto.`
    : `4) Pídele que te avise cuando haya pagado. 5) Cuando confirme que pagó, agenda con book_appointment payment_confirmed=true (ya tienes nombre y correo del paso 2 — NO los vuelvas a pedir).`
}
- Nunca agendes una cita paga sin ${cfg.require_payment_proof ? "haber validado el comprobante" : "que el cliente confirme el pago"}.\n` : ""}
⛔ REGLA CRÍTICA DE AGENDAMIENTO: para que una cita exista DEBES llamar a la herramienta book_appointment y esperar su respuesta de éxito. NUNCA, bajo ninguna circunstancia, le digas al cliente que la cita "quedó agendada", "ya está lista" o "te envié la invitación" si NO has llamado a book_appointment en este mismo turno y recibido la confirmación "Cita agendada correctamente". Afirmar que agendaste sin llamar la herramienta es un error grave. Si el cliente ya confirmó día, hora${cfg.appointment_modality === "both" ? ", modalidad" : ""} y correo, tu ÚNICA acción correcta es llamar book_appointment AHORA (no respondas solo texto).\n`
    : "";

  const mediaBlock = opts.media.length
    ? `\nARCHIVOS QUE PUEDES ENVIAR (usa la herramienta send_media con el id correspondiente cuando sea útil):
${opts.media.map((m) => `- id: ${m.id} | ${m.name}${m.description ? ` — ${m.description}` : ""}`).join("\n")}\n`
    : "";

  // Reschedule/cancel (only if the contact has an upcoming appointment)
  const rescheduleBlock = (opts.canBook && opts.upcomingMeeting)
    ? `\nCITA EXISTENTE DEL CLIENTE: "${opts.upcomingMeeting.title}" el ${new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "full", timeStyle: "short" }).format(new Date(opts.upcomingMeeting.start_at))}.
- Si el cliente quiere CAMBIAR la fecha/hora, usa reschedule_appointment con la nueva fecha (verifica disponibilidad antes).
- Si el cliente quiere CANCELAR, confirma con él y usa cancel_appointment.\n`
    : "";

  // CRM actions (lead qualification)
  const memoryBlock = opts.contactMemory
    ? `\nMEMORIA DEL CLIENTE (de conversaciones anteriores — YA SABES esto sobre esta persona, NO se lo vuelvas a preguntar; retómalo con naturalidad):
${opts.contactMemory}\n`
    : "";

  // Pipeline moves + tagging are OFF by default; only when the org opts in
  // (agent_auto_pipeline) does the agent manage stages/tags on its own.
  const pipelineBlock = opts.autoPipeline
    ? `- Etiqueta al lead según su interés.${opts.orgTags?.length ? ` Etiquetas disponibles: ${opts.orgTags.join(", ")}. Puedes crear una nueva si ninguna aplica.` : ""}
${opts.stages?.length ? `- Mueve al lead de etapa según avance la conversación. Etapas: ${opts.stages.join(" → ")}. (Ej: si agenda cita, muévelo a la etapa de cita; si muestra intención de compra, a una etapa más avanzada.)\n` : ""}`
    : `- NO muevas al lead de etapa del pipeline ni crees/agregues etiquetas por tu cuenta. Eso lo maneja el equipo manualmente.\n`;

  const crmBlock = `\nACCIONES EN EL CRM (hazlas en segundo plano, sin anunciárselas al cliente, usando update_lead):
- Si el cliente da su NOMBRE o CORREO y no los teníamos, guárdalos (full_name / email).
${pipelineBlock}- Registra una nota breve (note) con el interés o resumen relevante cuando sea útil.
- MEMORIA PERSISTENTE (importante): cada vez que aprendas algo relevante y duradero del cliente (respuestas de evaluación, objetivos, condiciones/dolencias, objeciones, estado de pago, estado de la cita, contexto personal), llama a update_lead con el campo "memory" y guarda un RESUMEN COMPLETO y ACTUALIZADO de todo lo que sabes de esta persona (no solo lo nuevo — reescribe el resumen entero incluyendo lo anterior de la MEMORIA DEL CLIENTE si existe). Este resumen se recuerda para SIEMPRE en futuras conversaciones. Sé completo pero conciso (varias líneas, hasta ~1500 caracteres).\n`;

  return `Eres ${cfg.agent_name || "Asistente"}, el asistente virtual de ${cfg.business_name || "nuestra empresa"}.
Tu rol es atender consultas de clientes por ${["WhatsApp", "Instagram", "Messenger"].join("/")} de forma rápida y útil.

${tone}
${regionBlock}

${cfg.business_description ? `SOBRE EL NEGOCIO:\n${cfg.business_description}\n` : ""}
${cfg.products ? `PRODUCTOS Y SERVICIOS:\n${cfg.products}\n` : ""}
${cfg.faqs ? `PREGUNTAS FRECUENTES:\n${cfg.faqs}\n` : ""}
${memoryBlock}${bookingBlock}${rescheduleBlock}${crmBlock}${mediaBlock}
REGLAS IMPORTANTES:
1. Responde siempre en el idioma en que te escriben.
2. Sé MUY conciso — esto es WhatsApp, no un correo. Mensajes cortos, como los escribiría una persona real por chat. Máximo 1-2 oraciones por bloque. Ve al grano, sin párrafos largos ni explicaciones extensas. Si puedes decirlo en menos palabras, hazlo.
3. Si tu respuesta necesita más de un punto, separa cada punto con una línea en blanco (\\n\\n). Cada bloque separado se enviará como un mensaje independiente. Usa máximo 3 bloques.
4. Si no sabes algo o el tema está fuera de tu alcance, responde: "${cfg.off_topic_response || "Lo siento, no tengo información sobre ese tema. Un asesor te ayudará en breve."}"
5. NUNCA inventes precios, fechas ni datos que no tengas.
6. Si el usuario quiere hablar con una persona o muestra intención clara de compra, responde EXACTAMENTE con este texto (sin modificarlo): ESCALAR_A_HUMANO
7. No menciones que eres una IA a menos que te lo pregunten directamente.
8. Saluda SOLO en tu primer mensaje de la conversación. Si en el historial ya saludaste, ve directo al punto sin "¡Hola!" ni bienvenidas repetidas.`;
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

    // 5. Pre-check credit quota (billing). Billing is per-CREDIT (1 credit = 1.000
    //    tokens); the actual credits are deducted AFTER the reply by
    //    record_ai_agent_usage, since token usage isn't known until we generate.
    const { data: sessionData, error: sessionErr } = await supabase.rpc(
      "check_ai_agent_quota",
      { p_org_id: organization_id, p_channel: channel, p_session_key: session_key },
    );
    if (sessionErr) {
      console.error("check_ai_agent_quota error:", sessionErr.message);
      // Non-fatal — continue anyway to not block the user experience
    }
    if (sessionData && sessionData.allowed === false) {
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

    // Email already on file for this contact (so the agent can confirm it
    // instead of asking from scratch).
    let contactEmailOnFile: string | null = null;
    let contactMemory: string | null = null;
    let contactStages: { id: string; name: string }[] = [];
    let upcomingMeeting: { id: string; title: string; start_at: string; google_event_id: string | null; meeting_type: string | null } | null = null;
    if (contact_id) {
      const { data: cInfo } = await supabase.from("contacts")
        .select("primary_email, pipeline_id, ai_memory").eq("id", contact_id).maybeSingle();
      contactEmailOnFile = cInfo?.primary_email || null;
      contactMemory = cInfo?.ai_memory || null;
      // Pipeline stages for this contact's pipeline (for CRM stage moves)
      const pid = cInfo?.pipeline_id || "00000000-0000-0000-0000-000000000001";
      const { data: stages } = await supabase.from("pipeline_stages")
        .select("id, name").eq("pipeline_id", pid).order("order");
      contactStages = (stages as any) || [];
      // Next upcoming appointment (for reschedule/cancel)
      const { data: mtg } = await supabase.from("meetings")
        .select("id, title, start_at, google_event_id, meeting_type")
        .eq("contact_id", contact_id).eq("status", "scheduled")
        .gt("start_at", new Date().toISOString())
        .order("start_at", { ascending: true }).limit(1).maybeSingle();
      upcomingMeeting = (mtg as any) || null;
    }

    // Org tag catalog (for lead tagging)
    const { data: orgTagRows } = await supabase.from("organization_tags")
      .select("name").eq("organization_id", organization_id).limit(60);
    const orgTags = (orgTagRows || []).map((t: any) => t.name);

    const nowBogota = new Intl.DateTimeFormat("es-CO", {
      timeZone: "America/Bogota", dateStyle: "full", timeStyle: "short",
    }).format(new Date());

    // Explicit date table (next 14 days) so the model maps weekdays exactly
    // (Haiku otherwise miscounts days). Each line: "miércoles 17 de junio → 2026-06-17".
    const upcomingDates = (() => {
      const fmt = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long" });
      const isoFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" });
      const lines: string[] = [];
      for (let i = 0; i < 14; i++) {
        const d = new Date(Date.now() + i * 86400000);
        const label = i === 0 ? " (hoy)" : i === 1 ? " (mañana)" : "";
        lines.push(`  ${fmt.format(d)}${label} → ${isoFmt.format(d)}`);
      }
      return lines.join("\n");
    })();

    // 8. Build tools available to the agent
    const tools: any[] = [];
    if (cfg.auto_qualify) {
      tools.push({
        name: "qualify_lead",
        description: "Marca esta conversacion como LEAD CALIFICADO. Llamala UNA sola vez, en el mismo turno en que el cliente muestre intencion clara de compra: pregunta precios/costos/planes, quiere agendar cita o llamada, pide cotizacion o propuesta, comparte su telefono o correo, o pregunta como comprar/contratar. NO la llames por saludos, recursos gratuitos de automatizaciones, preguntas genericas, quejas/soporte ni simple curiosidad. Ante la duda, NO la llames.",
        input_schema: {
          type: "object",
          properties: {
            reason: { type: "string", description: "Razon corta y concreta. Ej: 'pregunto precio del plan Pro y quiere agendar'" },
          },
          required: ["reason"],
        },
      });
    }
    if (canBook) {
      tools.push({
        name: "check_availability",
        description: "Consulta los horarios REALMENTE disponibles de un día (cruza el horario de atención con la agenda ocupada en Google Calendar). Úsala ANTES de ofrecer horas al cliente.",
        input_schema: {
          type: "object",
          properties: {
            date_iso: { type: "string", description: "Fecha a consultar en formato YYYY-MM-DD. Ej: 2026-06-17" },
          },
          required: ["date_iso"],
        },
      });
      tools.push({
        name: "book_appointment",
        description: "Agenda una cita/reunión con el cliente. Úsala SOLO cuando el cliente ya confirmó fecha, hora y modalidad (virtual o presencial).",
        input_schema: {
          type: "object",
          properties: {
            datetime_iso: { type: "string", description: "Fecha y hora de inicio en ISO 8601, hora de Colombia. Ej: 2026-06-20T15:00:00" },
            mode: { type: "string", enum: ["virtual", "presencial"], description: "virtual = se genera link de Google Meet. presencial = en una dirección física." },
            address: { type: "string", description: "Dirección de la reunión (solo si mode=presencial)." },
            title: { type: "string", description: "Título corto de la cita. Ej: Cita con Juan Pérez" },
            notes: { type: "string", description: "Notas o tema de la cita (opcional)" },
            client_email: { type: "string", description: "Email del cliente para enviarle la invitación (opcional pero recomendado; pídeselo si no lo tienes)." },
            payment_confirmed: { type: "boolean", description: "true SOLO si las citas requieren pago Y el cliente ya confirmó que pagó. Si el negocio no cobra, omítelo." },
          },
          required: ["datetime_iso", "mode"],
        },
      });
    }
    // CRM lead actions (always available)
    tools.push({
      name: "update_lead",
      description: "Actualiza el lead/contacto en el CRM en segundo plano: guardar nombre/correo, agregar etiquetas, mover de etapa del pipeline, o registrar una nota. No se lo anuncies al cliente.",
      input_schema: {
        type: "object",
        properties: {
          full_name: { type: "string", description: "Nombre completo del cliente (si lo proporciona y no lo teníamos)." },
          email: { type: "string", description: "Correo del cliente (si lo proporciona)." },
          tags: { type: "array", items: { type: "string" }, description: "Etiquetas a agregar al lead." },
          stage: { type: "string", description: "Nombre EXACTO de la etapa del pipeline a la que mover el lead (de la lista de etapas disponibles)." },
          note: { type: "string", description: "Nota breve sobre el interés o resumen para el vendedor." },
          memory: { type: "string", description: "Resumen COMPLETO y actualizado de todo lo relevante que sabes del cliente (evaluación, objetivos, dolencias, objeciones, estado de pago/cita, contexto personal). Reescribe el resumen entero incluyendo lo anterior. Se recuerda para siempre en futuras conversaciones." },
        },
      },
    });
    if (canBook && upcomingMeeting) {
      tools.push({
        name: "reschedule_appointment",
        description: "Cambia la fecha/hora de la cita existente del cliente. Verifica disponibilidad antes con check_availability.",
        input_schema: {
          type: "object",
          properties: { new_datetime_iso: { type: "string", description: "Nueva fecha y hora en ISO. Ej: 2026-06-18T15:00:00" } },
          required: ["new_datetime_iso"],
        },
      });
      tools.push({
        name: "cancel_appointment",
        description: "Cancela la cita existente del cliente. Úsala solo cuando el cliente lo confirme.",
        input_schema: { type: "object", properties: {} },
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
      for (const m of recent_messages.slice(-16)) {
        history.push({ role: m.role, content: m.content });
      }
    }
    history.push({ role: "user", content: userContent });

    let system = buildSystemPrompt(cfg, { nowBogota, upcomingDates, canBook, media: mediaList, contactEmail: contactEmailOnFile, contactMemory, orgTags, stages: contactStages.map(s => s.name), upcomingMeeting, autoPipeline: !!cfg.agent_auto_pipeline });
    if (cfg.auto_qualify) {
      system += `

## Calificacion de intencion (interno — el cliente NUNCA debe ver esto)
Al FINAL de cada respuesta, en una linea aparte, agrega EXACTAMENTE un marcador con este formato:
[[INTENT:alto|razon breve]] o [[INTENT:medio]] o [[INTENT:ninguno]]

Marca "alto" SOLO si en esta conversacion el cliente: pregunta precios/costos/planes, quiere agendar cita o llamada, pide cotizacion o propuesta, comparte su telefono o correo voluntariamente, o pregunta como comprar/contratar o disponibilidad para adquirir.
NO marques "alto" por: saludos, pedir el recurso gratuito de una automatizacion, preguntas genericas, quejas o soporte de clientes existentes, curiosidad ("de que trata").
Ante la duda usa "medio" o "ninguno". La razon debe ser corta y concreta (ej: "pregunto precio del plan Pro y quiere agendar").`;
    }
    const mediaToSend: any[] = [];
    let aiText = "";
    let bookedThisTurn = false;
    let nudgedOnce = false;
    // Token metering: accumulate Anthropic usage across the whole tool-calling
    // loop so we can record the real cost of this conversation (see migration
    // 20260615000000_ai_agent_token_metering).
    let usageIn = 0, usageOut = 0, aiCalls = 0;

    // 10. Tool-calling loop (max 5 turns to allow book + send + reply + 1 nudge)
    for (let turn = 0; turn < 5; turn++) {
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
      usageIn += claudeData.usage?.input_tokens || 0;
      usageOut += claudeData.usage?.output_tokens || 0;
      aiCalls++;
      const blocks: any[] = claudeData.content || [];
      aiText = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n\n").trim();

      if (claudeData.stop_reason !== "tool_use") {
        // Safety net: the model claims it booked but never called book_appointment.
        // Give it ONE forced chance to actually call the tool.
        const claimsBooked = /\bagend(é|e|ada|ado|amos)\b|invitaci[oó]n|qued[oó]\s+(lista|agendada|confirmada)|ya\s+est[aá]\s+(lista|agendada)/i.test(aiText);
        if (canBook && !bookedThisTurn && !nudgedOnce && claimsBooked) {
          nudgedOnce = true;
          history.push({ role: "assistant", content: blocks });
          history.push({ role: "user", content: "(SISTEMA: NO has agendado realmente — no llamaste a book_appointment. Si ya tienes día, hora, modalidad y correo confirmados por el cliente, llama AHORA a book_appointment. Si falta algún dato, pídelo. No le digas al cliente que está agendada hasta que la herramienta confirme.)" });
          continue;
        }
        break;
      }

      // Execute each requested tool and feed results back
      history.push({ role: "assistant", content: blocks });
      const toolResults: any[] = [];
      for (const b of blocks) {
        if (b.type !== "tool_use") continue;
        let resultText = "";
        try {
          if (b.name === "check_availability") {
            resultText = await checkAvailability(supabase, advisorUserId!, b.input?.date_iso, cfg.working_hours, cfg.appointment_duration_min || 30, cfg.appointment_slot_capacity, cfg.appointment_slot_interval_min || null);
          } else if (b.name === "book_appointment") {
            resultText = await bookAppointment(supabase, {
              organization_id, advisorUserId: advisorUserId!, contact_id,
              slotCap: cfg.appointment_slot_capacity,
              durationMin: cfg.appointment_duration_min || 30,
              workingHours: cfg.working_hours,
              defaultAddress: cfg.meeting_address || null,
              modality: cfg.appointment_modality || "both",
              requiresPayment: !!cfg.appointments_paid,
              input: b.input,
            });
            if (resultText.startsWith("Cita agendada correctamente")) bookedThisTurn = true;
          } else if (b.name === "update_lead") {
            resultText = await updateLead(supabase, { organization_id, contact_id, advisorUserId, stages: contactStages, input: b.input, autoPipeline: !!cfg.agent_auto_pipeline });
          } else if (b.name === "reschedule_appointment") {
            resultText = await rescheduleAppointment(supabase, {
              meeting: upcomingMeeting, advisorUserId: advisorUserId!, workingHours: cfg.working_hours,
              durationMin: cfg.appointment_duration_min || 30, input: b.input,
            });
          } else if (b.name === "cancel_appointment") {
            resultText = await cancelAppointment(supabase, { meeting: upcomingMeeting, advisorUserId: advisorUserId! });
          } else if (b.name === "qualify_lead") {
            try {
              await autoQualifyLead(supabase, {
                organization_id, channel, session_key,
                reason: (b.input?.reason || "Intencion de compra detectada").toString().slice(0, 300),
                fallbackUserId: user_id ?? null,
              });
              resultText = "Lead calificado y registrado en el pipeline. Continua la conversacion normalmente, no menciones este registro al cliente.";
            } catch (e2: any) {
              console.error("[qualify_lead] failed:", e2?.message);
              resultText = "No se pudo registrar (error interno). Continua la conversacion normalmente.";
            }
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

    // 10b. Record real token spend for this conversation (fire-and-forget,
    //      non-fatal). Lets us compute true cost/conversation vs the add-on price.
    if (sessionData?.session_id && (usageIn || usageOut)) {
      supabase.rpc("record_ai_agent_usage", {
        p_session_id: sessionData.session_id,
        p_tokens_input: usageIn,
        p_tokens_output: usageOut,
        p_calls: aiCalls,
      }).then(({ error }: any) => {
        if (error) console.error("record_ai_agent_usage error:", error.message);
      });
    }

    // 10c. Intent marker: strip it from the reply and, when intent is HIGH and
    //      auto-qualify is on, create/link the lead (fire-and-forget).
    let intentLevel: string | null = null;
    let intentReason: string | null = null;
    const intentMatch = aiText.match(/\[\[INTENT:(alto|medio|ninguno)(?:\|([^\]]*))?\]\]/i);
    if (intentMatch) {
      intentLevel = intentMatch[1].toLowerCase();
      intentReason = (intentMatch[2] || "").trim() || null;
      aiText = aiText.replace(intentMatch[0], "").trim();
    }
    if (cfg.auto_qualify && intentLevel === "alto") {
      const qualifyPromise = autoQualifyLead(supabase, {
        organization_id, channel, session_key,
        reason: intentReason || "Intencion de compra detectada",
        fallbackUserId: user_id ?? cfg.user_id ?? null,
      }).catch((e: any) => console.warn("autoQualifyLead failed:", e?.message));
      // @ts-ignore EdgeRuntime is Deno Deploy specific
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(qualifyPromise);
      else await qualifyPromise;
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

    // 12. Fallback for empty text. Claude can finish a turn having ONLY called a
    //     tool (e.g. send_media for the catalog) without writing any prose, which
    //     leaves aiText = "". An empty response is treated as "no reply" upstream
    //     and silently retried/dropped. Guarantee a usable reply so the customer
    //     always gets something — especially when we're attaching media.
    if (!aiText) {
      aiText = mediaToSend.length
        ? "Te comparto la información 👇"
        : "¿Te puedo ayudar en algo más? 😊";
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

// Bogota is UTC-5 (no DST). Build a UTC Date from a Bogota wall-clock.
function bogotaToUtc(y: number, mo: number, d: number, hh: number, mm: number): Date {
  return new Date(Date.UTC(y, mo - 1, d, hh + 5, mm));
}

// Ask Google Calendar for busy intervals in a window (via create-calendar-event).
async function fetchBusy(advisorUserId: string, timeMinIso: string, timeMaxIso: string): Promise<{ start: string; end: string }[]> {
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/create-calendar-event`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    },
    body: JSON.stringify({ action: "freebusy", user_id: advisorUserId, time_min: timeMinIso, time_max: timeMaxIso }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.success) return [];
  return (body.busy || []) as { start: string; end: string }[];
}

const overlaps = (s1: number, e1: number, s2: number, e2: number) => s1 < e2 && s2 < e1;

// Per-slot capacity: how many concurrent appointments a slot allows. Default 1;
// configured peak slots (specific weekdays + start-hours) allow more (e.g. 2).
// cfg shape: { enabled, capacity, days:[0-6], hours:[9,10,...] } (Bogota time).
function slotCapacity(slotStartMs: number, cap: any): number {
  if (!cap?.enabled) return 1;
  // Bogota = UTC-5 (no DST). Derive weekday + start hour in Bogota.
  const bog = new Date(slotStartMs - 5 * 3600000);
  const dow = bog.getUTCDay();          // 0=Sun..6=Sat, Bogota
  const hh = bog.getUTCHours();
  const mm = bog.getUTCMinutes();
  const hhmm = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`; // Bogota HH:MM
  // Support multiple rules; fall back to a single legacy rule (days/hours/capacity).
  const rules: any[] = Array.isArray(cap.rules) && cap.rules.length
    ? cap.rules
    : [{ days: cap.days, hours: cap.hours, capacity: cap.capacity }];
  // A rule "hour" may be a number (legacy: whole-hour, matches HH:00) or a
  // "HH:MM" string (exact slot start, e.g. "10:30").
  const matchTime = (entry: any): boolean => {
    if (typeof entry === "number") return mm === 0 && hh === entry;
    return String(entry) === hhmm;
  };
  let best = 1;
  for (const r of rules) {
    const days: number[] = Array.isArray(r?.days) ? r.days : [];
    const hours: any[] = Array.isArray(r?.hours) ? r.hours : [];
    const matchDay = days.length === 0 || days.includes(dow);
    const matchHour = hours.length === 0 || hours.some(matchTime);
    if (matchDay && matchHour) best = Math.max(best, Math.max(1, Number(r?.capacity) || 2));
  }
  return best;
}

// Count the org's own CONFIRMED meetings that overlap a slot for this advisor.
async function crmBookedCount(supabase: any, advisorUserId: string, slotStartMs: number, slotEndMs: number): Promise<number> {
  const { data } = await supabase.from("meetings")
    .select("id")
    .eq("advisor_id", advisorUserId)
    .in("status", ["scheduled", "confirmed"])
    .gte("start_at", new Date(slotStartMs - 60000).toISOString())
    .lt("start_at", new Date(slotEndMs).toISOString());
  return (data || []).length;
}

// Compute the real free slots for a day: working hours minus Google-busy minus past.
async function checkAvailability(supabase: any, advisorUserId: string, dateIso: string, workingHours: any, durationMin: number, slotCap: any, intervalMin?: number | null): Promise<string> {
  const m = (dateIso || "").match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "Fecha inválida. Usa formato YYYY-MM-DD.";
  const [_, y, mo, d] = m.map(Number) as unknown as number[];
  const dowKey = DOW[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  const wh = workingHours?.[dowKey];
  if (!wh?.enabled) return `Ese día no se atiende. Ofrece otro día dentro del horario.`;

  const [sH, sM] = String(wh.start || "09:00").split(":").map(Number);
  const [eH, eM] = String(wh.end || "18:00").split(":").map(Number);
  const dayStart = bogotaToUtc(y, mo, d, sH, sM).getTime();
  const dayEnd = bogotaToUtc(y, mo, d, eH, eM).getTime();

  const busy = await fetchBusy(advisorUserId, new Date(dayStart).toISOString(), new Date(dayEnd).toISOString());
  const busyMs = busy.map(b => [new Date(b.start).getTime(), new Date(b.end).getTime()] as [number, number]);

  // Slot length = the appointment duration. Iteration step = the configured
  // interval (e.g. 30 min) so 1h appointments can start every half hour;
  // defaults to the duration when no interval is set (unchanged behavior).
  const durMs = durationMin * 60000;
  const stepMs = (intervalMin && intervalMin > 0 ? intervalMin : durationMin) * 60000;
  const now = Date.now();
  const free: string[] = [];
  for (let t = dayStart; t + durMs <= dayEnd; t += stepMs) {
    if (t < now) continue;
    const cap = slotCapacity(t, slotCap);
    const googleBusy = busyMs.some(([bs, be]) => overlaps(t, t + durMs, bs, be));
    // occupied = our own concurrent CRM meetings; if none but Google shows busy,
    // it's an external event taking 1 unit. Free when occupied < capacity.
    const crm = await crmBookedCount(supabase, advisorUserId, t, t + durMs);
    const occupied = crm > 0 ? crm : (googleBusy ? 1 : 0);
    if (occupied >= cap) continue;
    // Label in Bogota HH:mm
    const label = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(t));
    free.push(label);
  }
  if (!free.length) return `No hay horarios libres ese día (todo ocupado o fuera de horario). Ofrece otro día.`;
  return `Horarios disponibles ese día: ${free.join(", ")}. Ofrécele estos al cliente.`;
}

// Validate the requested slot against working hours, create the meeting row and
// the Google Calendar event. Returns a short result string for the model.
async function bookAppointment(
  supabase: any,
  args: {
    organization_id: string; advisorUserId: string; contact_id: string | null;
    durationMin: number; workingHours: any; defaultAddress?: string | null; modality?: string; requiresPayment?: boolean; input: any; slotCap?: any;
  },
): Promise<string> {
  const { organization_id, advisorUserId, contact_id, durationMin, workingHours, defaultAddress, modality, requiresPayment, input, slotCap } = args;

  // Paid appointments: never book until the client confirmed payment.
  if (requiresPayment && !input?.payment_confirmed) {
    return "Esta cita requiere pago previo. Envíale al cliente el precio y el link de pago, y NO agendes hasta que confirme que pagó (entonces llama con payment_confirmed=true).";
  }
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

  // Capacity-aware availability: a slot may allow >1 concurrent appointment
  // (configured peak hours). Reject only when the slot is at/over capacity.
  const cap = slotCapacity(startUtc.getTime(), slotCap);
  const busy = await fetchBusy(advisorUserId, startUtc.toISOString(), endUtc.toISOString());
  const googleBusy = busy.some(b => overlaps(startUtc.getTime(), endUtc.getTime(), new Date(b.start).getTime(), new Date(b.end).getTime()));
  const crm = await crmBookedCount(supabase, advisorUserId, startUtc.getTime(), endUtc.getTime());
  const occupied = crm > 0 ? crm : (googleBusy ? 1 : 0);
  if (occupied >= cap) {
    return "Esa hora ya está llena (sin cupos disponibles). Usa check_availability para ofrecer otra hora libre.";
  }

  // Contact info for the title/attendee
  let contactName = "Cliente";
  let contactEmail: string | null = null;
  if (contact_id) {
    const { data: c } = await supabase.from("contacts")
      .select("full_name, primary_email").eq("id", contact_id).maybeSingle();
    contactName = c?.full_name || contactName;
    contactEmail = c?.primary_email || null;
  }
  // Prefer the email the agent collected in chat, fall back to the stored one.
  const attendeeEmail: string | null = (input?.client_email || contactEmail || null);

  // If the client gave an email and the contact had none, save it for next time.
  if (contact_id && input?.client_email && !contactEmail && /\S+@\S+\.\S+/.test(input.client_email)) {
    await supabase.from("contacts").update({ primary_email: input.client_email }).eq("id", contact_id);
  }
  const title = (input?.title || `Cita con ${contactName}`).slice(0, 120);
  const notes = input?.notes || null;

  // Modality policy overrides whatever the model passed.
  const isVirtual = modality === "virtual" ? true
    : modality === "presencial" ? false
    : (input?.mode || "virtual") !== "presencial";
  const address: string | null = !isVirtual ? (input?.address || defaultAddress || null) : null;
  const meetingType = isVirtual ? "video_call" : "in_person";

  // Insert the meeting row (CRM)
  const { data: meeting, error: mErr } = await supabase.from("meetings").insert({
    organization_id, contact_id, advisor_id: advisorUserId,
    title, start_at: startUtc.toISOString(), end_at: endUtc.toISOString(),
    timezone: "America/Bogota", status: "scheduled", meeting_type: meetingType,
    location_or_link: address, notes,
    payment_status: requiresPayment ? "paid" : "not_required",
  }).select("id").single();
  if (mErr) return `No se pudo guardar la cita: ${mErr.message}`;

  // Create the Google Calendar event (best-effort). Virtual → generate Meet link;
  // presencial → set the address. Sends an email invite to the client.
  let meetLink: string | null = null;
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/create-calendar-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      },
      body: JSON.stringify({
        action: "create", user_id: advisorUserId, title,
        description: notes || `Cita agendada por el asistente virtual con ${contactName}.`,
        start_at: startUtc.toISOString(), end_at: endUtc.toISOString(),
        location: address || undefined,
        create_meet: isVirtual,
        attendee_email: attendeeEmail || undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body?.google_event_id) {
      meetLink = body.meet_link || null;
      const upd: Record<string, unknown> = { google_event_id: body.google_event_id };
      if (meetLink && isVirtual) upd.location_or_link = meetLink; // store Meet link in CRM
      await supabase.from("meetings").update(upd).eq("id", meeting.id);
    }
  } catch (e) {
    console.warn("[ai-agent] gcal create failed:", e);
  }

  const when = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota", dateStyle: "full", timeStyle: "short",
  }).format(startUtc);
  const detail = isVirtual
    ? (meetLink ? ` Es virtual; el enlace de Google Meet es: ${meetLink}` : " Es virtual (el enlace de Meet llegará en la invitación).")
    : (address ? ` Es presencial en: ${address}.` : " Es presencial.");
  const invite = attendeeEmail ? " Le llegará una invitación por correo." : " (No tengo su correo; pídeselo si quiere recibir la invitación por email.)";
  return `Cita agendada correctamente para ${when}.${detail}${invite} Confírmasela al cliente.`;
}

// CRM lead actions: name/email, tags, pipeline stage, note.
async function updateLead(
  supabase: any,
  args: { organization_id: string; contact_id: string | null; advisorUserId: string | null; stages: { id: string; name: string }[]; input: any; autoPipeline?: boolean },
): Promise<string> {
  const { organization_id, contact_id, stages, input, autoPipeline } = args;
  if (!contact_id) return "No hay un contacto asociado a esta conversación.";
  const done: string[] = [];
  const contactUpdate: Record<string, unknown> = {};

  if (input?.full_name) { contactUpdate.full_name = String(input.full_name).slice(0, 120); done.push("nombre"); }
  if (input?.email && /\S+@\S+\.\S+/.test(input.email)) { contactUpdate.primary_email = input.email; done.push("correo"); }
  // Persistent memory: overwrite the running summary of what we know about this client.
  if (input?.memory && String(input.memory).trim()) { contactUpdate.ai_memory = String(input.memory).slice(0, 2000); done.push("memoria"); }

  // Tags: merge into contacts.tags + register in catalog (only if the org lets
  // the agent manage the pipeline/tags automatically).
  if (autoPipeline && Array.isArray(input?.tags) && input.tags.length) {
    const { data: c } = await supabase.from("contacts").select("tags").eq("id", contact_id).maybeSingle();
    const existing: string[] = Array.isArray(c?.tags) ? c.tags : [];
    const lower = new Set(existing.map((t: string) => t.toLowerCase()));
    const merged = [...existing];
    for (const raw of input.tags) {
      const t = String(raw).trim();
      if (t && !lower.has(t.toLowerCase())) { merged.push(t); lower.add(t.toLowerCase()); }
      // register in org catalog (best-effort)
      await supabase.from("organization_tags").upsert({ organization_id, name: t }, { onConflict: "organization_id,name", ignoreDuplicates: true });
    }
    contactUpdate.tags = merged;
    done.push("etiquetas");
  }

  // Stage: map name → id within the contact's pipeline (only if opted in).
  if (autoPipeline && input?.stage) {
    const match = stages.find(s => s.name.toLowerCase() === String(input.stage).toLowerCase());
    if (match) { contactUpdate.stage_id = match.id; done.push(`etapa "${match.name}"`); }
  }

  if (Object.keys(contactUpdate).length) {
    await supabase.from("contacts").update(contactUpdate).eq("id", contact_id);
  }

  // Note → activity
  if (input?.note) {
    await supabase.from("activities").insert({
      related_entity_type: "contact", related_entity_id: contact_id,
      event_type: "note", event_source: "ai_agent",
      summary: `🤖 ${String(input.note).slice(0, 500)}`,
      created_by: args.advisorUserId || null,
    });
    done.push("nota");
  }

  return done.length ? `Lead actualizado (${done.join(", ")}).` : "No había nada que actualizar.";
}

// Reschedule the contact's upcoming appointment.
async function rescheduleAppointment(
  supabase: any,
  args: { meeting: any; advisorUserId: string; workingHours: any; durationMin: number; input: any },
): Promise<string> {
  const { meeting, advisorUserId, workingHours, durationMin, input } = args;
  if (!meeting) return "El cliente no tiene una cita próxima para reagendar.";
  const iso: string = input?.new_datetime_iso;
  const m = (iso || "").match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return "Formato de fecha inválido.";
  const [_, y, mo, d, hh, mm] = m;
  const startUtc = new Date(Date.UTC(+y, +mo - 1, +d, +hh + 5, +mm));
  if (isNaN(startUtc.getTime()) || startUtc.getTime() <= Date.now()) return "Esa fecha ya pasó. Ofrece una futura.";
  const dowKey = DOW[new Date(Date.UTC(+y, +mo - 1, +d)).getUTCDay()];
  const wh = workingHours?.[dowKey];
  if (!wh?.enabled) return "Ese día no se atiende. Ofrece otro.";
  const minutes = +hh * 60 + +mm;
  const [sH, sM] = String(wh.start || "09:00").split(":").map(Number);
  const [eH, eM] = String(wh.end || "18:00").split(":").map(Number);
  if (minutes < sH * 60 + sM || minutes + durationMin > eH * 60 + eM) return `Esa hora está fuera del horario (${wh.start}-${wh.end}).`;
  const endUtc = new Date(startUtc.getTime() + durationMin * 60000);

  // Availability (ignore the meeting's own current slot)
  const busy = await fetchBusy(advisorUserId, startUtc.toISOString(), endUtc.toISOString());
  if (busy.some(b => overlaps(startUtc.getTime(), endUtc.getTime(), new Date(b.start).getTime(), new Date(b.end).getTime()))) {
    return "Esa hora ya está ocupada. Ofrece otra hora libre.";
  }

  await supabase.from("meetings").update({ start_at: startUtc.toISOString(), end_at: endUtc.toISOString() }).eq("id", meeting.id);

  // Update Google Calendar event (sends update invite)
  if (meeting.google_event_id) {
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/create-calendar-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
        },
        body: JSON.stringify({
          action: "update", user_id: advisorUserId, google_event_id: meeting.google_event_id,
          title: meeting.title, start_at: startUtc.toISOString(), end_at: endUtc.toISOString(),
        }),
      });
    } catch (e) { console.warn("[ai-agent] reschedule gcal failed:", e); }
  }
  const when = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "full", timeStyle: "short" }).format(startUtc);
  return `Cita reagendada correctamente para ${when}. Confírmaselo al cliente.`;
}

// Cancel the contact's upcoming appointment.
async function cancelAppointment(
  supabase: any,
  args: { meeting: any; advisorUserId: string },
): Promise<string> {
  const { meeting, advisorUserId } = args;
  if (!meeting) return "El cliente no tiene una cita próxima para cancelar.";
  if (meeting.google_event_id) {
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/create-calendar-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
        },
        body: JSON.stringify({ action: "delete", user_id: advisorUserId, google_event_id: meeting.google_event_id }),
      });
    } catch (e) { console.warn("[ai-agent] cancel gcal failed:", e); }
  }
  await supabase.from("meetings").update({ status: "cancelled" }).eq("id", meeting.id);
  return "Cita cancelada correctamente. Confírmaselo al cliente.";
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


/**
 * AI auto-qualification: creates (or links) a lead for the conversation the
 * agent flagged as high-intent. One lead per conversation; existing contacts
 * get the tag + activity instead of a duplicate.
 */
async function autoQualifyLead(supabase: any, opts: {
  organization_id: string;
  channel: string;
  session_key: string;
  reason: string;
  fallbackUserId: string | null;
}): Promise<void> {
  const { organization_id, channel, session_key, reason, fallbackUserId } = opts;
  const TAG = "Calificado por IA";
  console.log(`[auto-qualify] start ch=${channel} key=${session_key} reason=${reason}`);

  // Resolve the conversation + existing contact per channel
  let contactId: string | null = null;
  let displayName: string | null = null;
  let convTable: string | null = null;
  let convId: string | null = null;

  if (channel === "instagram" || channel === "messenger") {
    convTable = channel === "instagram" ? "instagram_conversations" : "messenger_conversations";
    const nameCols = channel === "instagram"
      ? "id, contact_id, participant_name, participant_username"
      : "id, contact_id, participant_name";
    const { data: conv } = await supabase.from(convTable)
      .select(nameCols)
      .eq("organization_id", organization_id)
      .eq("participant_id", session_key)
      .order("last_message_at", { ascending: false })
      .limit(1).maybeSingle();
    if (!conv) return;
    convId = conv.id;
    contactId = conv.contact_id ?? null;
    displayName = conv.participant_name || (conv as any).participant_username || null;
  } else if (channel === "whatsapp") {
    const phone = session_key.startsWith("+") ? session_key : `+${session_key}`;
    const bare = phone.slice(1);
    const { data: existing } = await supabase.from("contacts")
      .select("id, tags")
      .eq("organization_id", organization_id)
      .or(`primary_phone.eq.${phone},primary_phone.eq.${bare}`)
      .limit(1).maybeSingle();
    contactId = existing?.id ?? null;
    displayName = phone;
  } else {
    return;
  }

  if (contactId) {
    // Already a lead — just record the qualification (tag + activity, no dup)
    const { data: c } = await supabase.from("contacts").select("tags").eq("id", contactId).maybeSingle();
    const tags: string[] = Array.isArray(c?.tags) ? c.tags : [];
    if (!tags.includes(TAG)) {
      await supabase.from("contacts").update({ tags: [...tags, TAG] }).eq("id", contactId);
      await supabase.from("activities").insert({
        related_entity_type: "contact", related_entity_id: contactId,
        event_type: "note", event_source: "ai_agent",
        summary: `🤖 Lead calificado por IA: ${reason}`,
        created_by: fallbackUserId,
      });
    }
    return;
  }

  // Create the lead in the default pipeline's first stage
  const fullName = displayName || `${channel} ${session_key.slice(-6)}`;
  const nameParts = fullName.split(" ");
  const { data: pipeline } = await supabase.from("pipelines").select("id")
    .eq("organization_id", organization_id)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  const { data: stage } = pipeline
    ? await supabase.from("pipeline_stages").select("id")
        .eq("pipeline_id", pipeline.id).order("order", { ascending: true }).limit(1).maybeSingle()
    : { data: null };

  const insertData: Record<string, unknown> = {
    full_name: fullName,
    first_name: nameParts[0] || fullName,
    last_name: nameParts.slice(1).join(" ") || null,
    source: channel,
    lead_status: "active",
    organization_id,
    owner_id: fallbackUserId,
    pipeline_id: pipeline?.id ?? null,
    stage_id: stage?.id ?? null,
    tags: [TAG],
  };
  if (channel === "whatsapp") {
    insertData.primary_phone = session_key.startsWith("+") ? session_key : `+${session_key}`;
  }
  const { data: newContact, error } = await supabase.from("contacts")
    .insert(insertData).select("id").single();
  if (error || !newContact) {
    console.warn("autoQualifyLead insert failed:", error?.message);
    return;
  }

  if (convTable && convId) {
    await supabase.from(convTable).update({ contact_id: newContact.id }).eq("id", convId);
  }
  await supabase.from("activities").insert({
    related_entity_type: "contact", related_entity_id: newContact.id,
    event_type: "note", event_source: "ai_agent",
    summary: `🤖 Lead calificado por IA: ${reason}`,
    created_by: fallbackUserId,
  });
  console.log(`[auto-qualify] Lead ${newContact.id} created (${channel}/${session_key}): ${reason}`);
}
