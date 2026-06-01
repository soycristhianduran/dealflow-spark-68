/**
 * call-analyzer — analyzes call transcripts via Claude and updates CRM data.
 *
 * Called by:
 *   - vapi-webhook after a call ends  (body: { call_log_id: "uuid" })
 *   - Frontend for manual re-analysis (same body shape)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Fields on `contacts` that Claude is allowed to update via crm_updates
const CONTACT_FIELD_WHITELIST = new Set(["budget", "notes", "city", "country", "company_name"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── 0. Auth check ────────────────────────────────────────────────────────
    // Accept:
    //   (a) service_role JWT — internal calls from vapi-webhook / cron-sync-calls.
    //       We decode the JWT payload to check the "role" claim instead of doing an
    //       exact string match (env-var value vs. header value may differ in encoding).
    //   (b) valid user JWT — frontend manual re-analysis (org membership checked below)
    //   (c) no token — internal cron calls that run without auth header
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    const bearerToken = authHeader.replace(/^bearer\s+/i, "").trim();

    // Decode JWT payload (base64url part 2) to check "role" claim — no crypto needed
    function jwtRole(token: string): string | null {
      try {
        const payload = token.split(".")[1];
        const padded = payload + "=".repeat((4 - payload.length % 4) % 4);
        const decoded = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
        return decoded?.role ?? null;
      } catch { return null; }
    }

    const isServiceRole = !bearerToken || jwtRole(bearerToken) === "service_role";

    let requestUserId: string | null = null;
    if (!isServiceRole) {
      // Validate user JWT via Supabase Auth
      const authClient = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);
      const { data: { user }, error: authErr } = await authClient.auth.getUser(bearerToken);
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      requestUserId = user.id;
    }

    // ── 1. Parse body ────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { call_log_id } = body as { call_log_id?: string };

    if (!call_log_id) {
      return new Response(
        JSON.stringify({ error: "call_log_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Supabase client (service role — bypasses RLS) ────────────────────────
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey,
    );

    // ── 2. Fetch call_log ────────────────────────────────────────────────────
    const { data: callLog, error: callLogError } = await supabase
      .from("call_logs")
      .select("id, organization_id, contact_id, campaign_id, calling_agent_id, transcript, structured_data")
      .eq("id", call_log_id)
      .maybeSingle();

    if (callLogError) {
      return new Response(
        JSON.stringify({ error: "DB error fetching call_log", detail: callLogError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!callLog) {
      return new Response(
        JSON.stringify({ error: "call_log not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 2b. Verify org membership for user JWT callers ───────────────────────
    if (!isServiceRole && requestUserId) {
      const { data: member } = await supabase
        .from("organization_members")
        .select("id")
        .eq("user_id", requestUserId)
        .eq("organization_id", callLog.organization_id)
        .maybeSingle();
      if (!member) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── 3. Skip if no transcript ─────────────────────────────────────────────
    const transcript = (callLog.transcript ?? "").trim();
    if (!transcript) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "empty transcript" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 4. Fetch contact basic info ──────────────────────────────────────────
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, score, lead_status, tags")
      .eq("id", callLog.contact_id)
      .maybeSingle();

    if (contactError) {
      return new Response(
        JSON.stringify({ error: "DB error fetching contact", detail: contactError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Unknown";
    const currentScore = contact?.score ?? 0;
    const currentStatus = contact?.lead_status ?? "new";
    const currentTags: string[] = Array.isArray(contact?.tags) ? contact.tags : [];

    // ── 4.5. Fetch calling agent questions (for field mapping) ────────────────
    interface AgentQuestion { id: string; text: string; field_key: string }
    let agentQuestions: AgentQuestion[] = [];

    if (callLog.calling_agent_id) {
      const { data: agentRow } = await supabase
        .from("calling_agents")
        .select("questions")
        .eq("id", callLog.calling_agent_id)
        .maybeSingle();

      if (agentRow?.questions && Array.isArray(agentRow.questions)) {
        agentQuestions = (agentRow.questions as unknown[])
          .filter((q): q is AgentQuestion => typeof q === "object" && q !== null && "text" in q)
          .map((q: AgentQuestion) => ({
            id: q.id ?? "",
            text: q.text ?? "",
            field_key: q.field_key ?? "",
          }))
          .filter(q => q.text.trim());
      }
    }

    // ── 5. Build Claude prompt ───────────────────────────────────────────────
    const structuredDataStr = callLog.structured_data
      ? JSON.stringify(callLog.structured_data, null, 2)
      : "None";

    // Build questions block — use field_key as the map key so lookup is exact
    // Strip any leading "N. " numbering from question.text for a cleaner prompt
    const stripNum = (s: string) => s.replace(/^\d+\.\s*/, "").trim();

    const questionsBlock = agentQuestions.length > 0
      ? `\n\nPreguntas que el agente debía hacer (extrae las respuestas del contacto de la transcripción):\n${
          agentQuestions
            .filter(q => q.field_key)
            .map((q) => `  - campo "${q.field_key}": "${stripNum(q.text)}"`)
            .join("\n")
        }\n\nPara cada pregunta incluye la respuesta del contacto en "question_answers" como un objeto con clave = field_key y valor = respuesta en texto (o null si no se respondió).`
      : "";

    const systemPrompt =
      "Eres una IA de inteligencia de ventas. Analiza esta transcripción de llamada y extrae datos estructurados. Responde TODO en español excepto los nombres de campos JSON.";

    const userPrompt = `Transcripción:
${transcript}

Datos ya extraídos por el sistema:
${structuredDataStr}

Info del contacto: ${contactName}, score actual: ${currentScore}, estado actual: ${currentStatus}${questionsBlock}

Responde ÚNICAMENTE con JSON válido (sin markdown) en este formato exacto:
{
  "temperature": "hot|warm|cold",
  "interest_level": "high|medium|low",
  "sentiment": "positive|neutral|negative",
  "budget_mentioned": "texto o null",
  "timeline_mentioned": "texto o null",
  "pain_points": ["...en español..."],
  "objections": ["...en español..."],
  "next_step": "texto en español",
  "ai_summary": "resumen de 2-3 oraciones en español",
  "score_delta": 0,
  "suggested_lead_status": "new|active|qualified|won|lost|null",
  "crm_updates": {},
  "tags_to_add": ["etiquetas_en_español_snake_case"],
  "question_answers": {}
}

score_delta debe ser un número entre -20 y 30.
suggested_lead_status debe ser uno de: new, active, qualified, won, lost, o null.
tags_to_add: genera etiquetas en español en snake_case (ej: "alto_volumen_leads", "usuario_excel"). Máximo 5 etiquetas relevantes.
question_answers: objeto con clave = field_key exacto de cada pregunta, valor = respuesta del contacto (string) o null si no respondió.`;

    // ── 6. Call Claude API ───────────────────────────────────────────────────
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1000,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return new Response(
        JSON.stringify({ error: "Claude API error", detail: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const claudeData = await claudeRes.json();
    const rawContent: string = claudeData?.content?.[0]?.text ?? "";

    // ── 7. Parse JSON response ───────────────────────────────────────────────
    let analysis: Record<string, unknown>;
    try {
      // Strip any accidental markdown fences
      const cleaned = rawContent.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      analysis = JSON.parse(cleaned);
    } catch (_e) {
      return new Response(
        JSON.stringify({ error: "Failed to parse Claude JSON response", raw: rawContent }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Extract typed values with safe defaults
    const temperature = String(analysis.temperature ?? "cold");
    const interest_level = String(analysis.interest_level ?? "low");
    const sentiment = String(analysis.sentiment ?? "neutral");
    const next_step = String(analysis.next_step ?? "");
    const ai_summary = String(analysis.ai_summary ?? "");
    const rawDelta = Number(analysis.score_delta ?? 0);
    const score_delta = Math.max(-20, Math.min(30, isNaN(rawDelta) ? 0 : rawDelta));
    const suggested_lead_status =
      analysis.suggested_lead_status !== "null" ? (analysis.suggested_lead_status as string | null) : null;
    const tags_to_add: string[] = Array.isArray(analysis.tags_to_add) ? (analysis.tags_to_add as string[]) : [];
    const crm_updates: Record<string, unknown> =
      analysis.crm_updates && typeof analysis.crm_updates === "object"
        ? (analysis.crm_updates as Record<string, unknown>)
        : {};
    const question_answers: Record<string, string | null> =
      analysis.question_answers && typeof analysis.question_answers === "object"
        ? (analysis.question_answers as Record<string, string | null>)
        : {};

    // ── 8. Update call_logs ──────────────────────────────────────────────────
    const { error: updateCallLogError } = await supabase
      .from("call_logs")
      .update({
        temperature,
        interest_level,
        sentiment,
        next_step,
        ai_summary,
        analysis,
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", call_log_id);

    if (updateCallLogError) {
      console.error("Error updating call_log:", updateCallLogError.message);
    }

    // ── 9. Update contact ────────────────────────────────────────────────────
    if (callLog.contact_id) {
      const newScore = Math.max(0, Math.min(100, currentScore + score_delta));

      // Build the contact update payload
      const contactUpdate: Record<string, unknown> = { score: newScore };

      if (suggested_lead_status && suggested_lead_status !== "null") {
        contactUpdate.lead_status = suggested_lead_status;
      }

      // Merge tags
      if (tags_to_add.length > 0) {
        const mergedTags = Array.from(new Set([...currentTags, ...tags_to_add]));
        contactUpdate.tags = mergedTags;
      }

      // Apply whitelisted crm_updates
      for (const [key, value] of Object.entries(crm_updates)) {
        if (CONTACT_FIELD_WHITELIST.has(key)) {
          contactUpdate[key] = value;
        }
      }

      const { error: updateContactError } = await supabase
        .from("contacts")
        .update(contactUpdate)
        .eq("id", callLog.contact_id);

      if (updateContactError) {
        console.error("Error updating contact:", updateContactError.message);
      }
    }

    // ── 9.5. Write question answers → contact.custom_fields ─────────────────
    // Map question text → field_key for all questions that have a field_key set
    if (callLog.contact_id && callLog.organization_id && agentQuestions.length > 0) {
      const customFieldsUpdate: Record<string, string> = {};
      const fieldDefsToUpsert: { organization_id: string; key: string; label: string; field_type: string }[] = [];

      for (const question of agentQuestions) {
        if (!question.field_key) continue;

        // Claude now uses field_key as the key; fall back to question text for backwards compat
        const answer = question_answers[question.field_key] ?? question_answers[question.text] ?? null;
        if (answer == null) continue;

        const cleanAnswer = String(answer).trim();
        if (!cleanAnswer) continue;

        customFieldsUpdate[question.field_key] = cleanAnswer;

        // Auto-register the field definition (upsert so existing defs are preserved)
        fieldDefsToUpsert.push({
          organization_id: callLog.organization_id,
          key: question.field_key,
          label: question.text,
          field_type: "text",
        });
      }

      if (Object.keys(customFieldsUpdate).length > 0) {
        // Fetch current custom_fields, merge, then write back
        const { data: currentContact } = await supabase
          .from("contacts")
          .select("custom_fields")
          .eq("id", callLog.contact_id)
          .maybeSingle();

        const existing =
          currentContact?.custom_fields &&
          typeof currentContact.custom_fields === "object" &&
          !Array.isArray(currentContact.custom_fields)
            ? (currentContact.custom_fields as Record<string, unknown>)
            : {};

        const merged = { ...existing, ...customFieldsUpdate };

        const { error: cfError } = await supabase
          .from("contacts")
          .update({ custom_fields: merged })
          .eq("id", callLog.contact_id);

        if (cfError) {
          console.error("Error writing custom fields:", cfError.message);
        }

        // Upsert custom_field_definitions so the fields show up in SettingsPage
        if (fieldDefsToUpsert.length > 0) {
          const { error: defError } = await supabase
            .from("custom_field_definitions")
            .upsert(fieldDefsToUpsert, { onConflict: "organization_id,key", ignoreDuplicates: true });

          if (defError) {
            console.error("Error upserting custom_field_definitions:", defError.message);
          }
        }
      }
    }

    // ── 10. Insert activity ──────────────────────────────────────────────────
    if (callLog.contact_id && callLog.organization_id) {
      // Build Q&A section for the activity note
      const qaLines: string[] = [];
      for (const question of agentQuestions) {
        const answer = question_answers[question.text];
        if (answer) {
          qaLines.push(`• ${question.text}: ${String(answer).trim()}`);
        }
      }

      const qaBlock = qaLines.length > 0
        ? `\n\n❓ Respuestas clave:\n${qaLines.join("\n")}`
        : "";

      const painBlock = Array.isArray(analysis.pain_points) && (analysis.pain_points as string[]).length > 0
        ? `\n\n🔥 Puntos de dolor: ${(analysis.pain_points as string[]).join(", ")}`
        : "";

      const objectionsBlock = Array.isArray(analysis.objections) && (analysis.objections as string[]).length > 0
        ? `\n\n⚠️ Objeciones: ${(analysis.objections as string[]).join(", ")}`
        : "";

      const nextStepBlock = next_step ? `\n\n➡️ Próximo paso: ${next_step}` : "";

      const activityDescription =
        `📞 Llamada de IA analizada\n\n${ai_summary}${qaBlock}${painBlock}${objectionsBlock}${nextStepBlock}`;

      const { error: activityError } = await supabase.from("activities").insert({
        organization_id: callLog.organization_id,
        contact_id: callLog.contact_id,
        type: "call",
        title: `Llamada IA — ${temperature === "hot" ? "🔥 Hot" : temperature === "warm" ? "🌡 Warm" : "❄️ Cold"} / Interés ${interest_level}`,
        description: activityDescription,
      });

      if (activityError) {
        console.error("Error inserting activity:", activityError.message);
      }
    }

    // ── 11. Fire automation-runner trigger_event ─────────────────────────────
    if (callLog.contact_id) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      const triggerPayload = {
        action: "trigger_event",
        trigger_type: "call.completed",
        contact_id: callLog.contact_id,
        trigger_data: {
          temperature,
          interest_level,
          call_log_id,
        },
      };

      fetch(`${supabaseUrl}/functions/v1/automation-runner`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify(triggerPayload),
      }).catch((err: Error) => {
        console.error("Error firing automation-runner:", err.message);
      });
    }

    // ── 12. Return result ────────────────────────────────────────────────────
    return new Response(
      JSON.stringify({ success: true, temperature, interest_level, ai_summary }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("call-analyzer unhandled error:", message);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
