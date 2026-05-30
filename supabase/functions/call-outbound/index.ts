/**
 * call-outbound — initiates outbound calls via Vapi.ai.
 *
 * Supported actions:
 *   { action: "call_contact", contact_id, calling_agent_id, organization_id, [campaign_id], [automation_enrollment_id] }
 *   { action: "launch_campaign", campaign_id }
 *
 * Auth: Bearer JWT (user token) OR service role key (from automation-runner).
 *
 * Env vars required:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   VAPI_API_KEY, VAPI_PHONE_NUMBER_ID
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VAPI_API = "https://api.vapi.ai/call";

// ── Supabase admin client (bypasses RLS for internal operations) ────────────
function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalise a raw phone number string to E.164 format required by Vapi.
 * Rules:
 *  - Already has "+" → strip non-digit after +, validate length ≥ 7
 *  - Starts with "00" → replace with "+"
 *  - 10 digits, starts with 3 → assume Colombia (+57)
 *  - 11 digits, starts with "57" and second digit is "3" → prepend "+"
 *  - 10 digits, starts with 1-9 → prepend "+" (international w/o +)
 *  - Otherwise → return as-is and let Vapi fail with a clear error
 */
function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-().]/g, ""); // strip spaces, dashes, parens, dots

  if (cleaned.startsWith("+")) {
    return cleaned; // already E.164
  }
  if (cleaned.startsWith("00")) {
    return "+" + cleaned.slice(2); // 0057... → +57...
  }

  const digits = cleaned.replace(/\D/g, "");

  // 10-digit Colombian mobile: starts with 3 → +57XXXXXXXXXX
  if (digits.length === 10 && digits.startsWith("3")) {
    return `+57${digits}`;
  }
  // 12-digit: already has country code 57 + 10 digits → just prepend +
  if (digits.length === 12 && digits.startsWith("57") && digits[2] === "3") {
    return `+${digits}`;
  }
  // 11-digit: country code + 10 digits (e.g. 1 for US/CA)
  if (digits.length === 11) {
    return `+${digits}`;
  }
  // Fallback: prepend + and hope for the best
  return `+${digits}`;
}

/** Increment a numeric counter column on a campaign row via RPC.
 *  Falls back to a direct UPDATE if the RPC does not exist yet. */
async function incCampaignCounter(
  supabase: ReturnType<typeof adminClient>,
  campaignId: string,
  column: "calls_initiated" | "calls_completed" | "calls_failed",
): Promise<void> {
  // Attempt RPC first
  const { error: rpcErr } = await supabase.rpc("inc_campaign_counter", {
    p_campaign_id: campaignId,
    p_column: column,
  });

  if (rpcErr) {
    // Fallback: fetch + increment + update
    console.warn(`inc_campaign_counter RPC failed (${rpcErr.message}), using fallback UPDATE`);
    const { data: row } = await supabase
      .from("calling_campaigns")
      .select(column)
      .eq("id", campaignId)
      .maybeSingle();

    if (row) {
      const current = (row as any)[column] ?? 0;
      await supabase
        .from("calling_campaigns")
        .update({ [column]: current + 1 })
        .eq("id", campaignId);
    }
  }
}

// ── Core: initiate a single call ─────────────────────────────────────────────

interface CallContactArgs {
  contactId: string;
  callingAgentId: string;
  organizationId: string;
  campaignId?: string | null;
  automationEnrollmentId?: string | null;
}

async function callContact(
  supabase: ReturnType<typeof adminClient>,
  args: CallContactArgs,
): Promise<{ success: boolean; callLogId?: string; vapiCallId?: string; error?: string }> {
  const { contactId, callingAgentId, organizationId, campaignId, automationEnrollmentId } = args;

  // 1. Fetch contact — need primary_phone
  const { data: contact, error: contactErr } = await supabase
    .from("contacts")
    .select("id, primary_phone, first_name, last_name, full_name")
    .eq("id", contactId)
    .maybeSingle();

  if (contactErr || !contact) {
    const msg = `Contact ${contactId} not found: ${contactErr?.message}`;
    console.error(msg);
    return { success: false, error: msg };
  }

  if (!contact.primary_phone) {
    const msg = `Contact ${contactId} has no primary_phone — skipping call`;
    console.warn(msg);
    return { success: false, error: msg };
  }

  // Normalise to E.164 before sending to Vapi
  const phoneE164 = normalizePhone(contact.primary_phone);
  console.log(`Phone normalised: "${contact.primary_phone}" → "${phoneE164}"`);
  contact.primary_phone = phoneE164;

  // 2. Fetch calling agent
  const { data: agent, error: agentErr } = await supabase
    .from("calling_agents")
    .select(
      "id, name, voice, language, first_message, system_prompt, objectives, questions, structured_data_schema, vapi_assistant_id",
    )
    .eq("id", callingAgentId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (agentErr || !agent) {
    const msg = `Calling agent ${callingAgentId} not found: ${agentErr?.message}`;
    console.error(msg);
    return { success: false, error: msg };
  }

  // 3. Fetch per-org Vapi config (BYOK)
  const { data: vapiCfg, error: vapiCfgErr } = await supabase
    .from("vapi_configs")
    .select("api_key, phone_number_id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .maybeSingle();

  if (vapiCfgErr || !vapiCfg) {
    const msg = "Vapi no está configurado para esta organización. Ve a Integraciones → Vapi para configurarlo.";
    console.error(msg, vapiCfgErr?.message);
    return { success: false, error: msg };
  }

  const vapiPhoneNumberId = vapiCfg.phone_number_id;

  // Personalise the first message with the contact's name when possible
  const contactName =
    contact.first_name ||
    (contact.full_name ? contact.full_name.split(" ")[0] : null) ||
    null;

  const firstMessage = contactName
    ? agent.first_message.replace(/\{\{nombre\}\}|\{\{name\}\}/gi, contactName)
    : agent.first_message;

  // Build system prompt — optionally append objectives/questions
  let systemPrompt: string = agent.system_prompt || "";
  if (Array.isArray(agent.objectives) && agent.objectives.length > 0) {
    systemPrompt += `\n\nOBJETIVOS DE LA LLAMADA:\n${agent.objectives.map((o: string, i: number) => `${i + 1}. ${o}`).join("\n")}`;
  }
  if (Array.isArray(agent.questions) && agent.questions.length > 0) {
    try {
      const qs = agent.questions as Array<{ text?: string; question?: string }>;
      systemPrompt += `\n\nPREGUNTAS QUE DEBES HACER (recoge la respuesta del contacto para cada una):\n${
        qs.map((q, i) => `${i + 1}. ${q.text || q.question || String(q)}`).join("\n")
      }`;
    } catch (_) {
      // Non-fatal — questions is optional metadata
    }
  }

  // Map our voice names → OpenAI TTS voice IDs (much more natural than Azure)
  // OpenAI voices: alloy, echo, fable, onyx, nova, shimmer
  const OPENAI_VOICE_MAP: Record<string, string> = {
    "Paola":     "nova",      // female, natural Spanish
    "Isabella":  "shimmer",   // female, softer
    "Valentina": "nova",      // female
    "David":     "onyx",      // male, deep
    "Brian":     "echo",      // male
  };
  const resolvedVoiceId = OPENAI_VOICE_MAP[agent.voice] ?? "nova";

  // Transcriber language — critical: without this Deepgram defaults to English
  // and won't understand Spanish speech at all
  const transcriberLanguage = (agent.language === "en") ? "en-US" : "es";
  const transcriberModel = (agent.language === "en") ? "nova-2" : "nova-2";

  // Ensure firstMessage is never empty — a silent agent hangs up immediately
  const safeFirstMessage = (firstMessage || "").trim() ||
    `Hola${contactName ? ` ${contactName}` : ""}, le llamo para contarle sobre nuestros servicios. ¿Tiene un momento?`;

  const vapiBody: Record<string, unknown> = {
    phoneNumberId: vapiPhoneNumberId,
    customer: { number: contact.primary_phone },
    assistant: {
      voice: {
        provider: "openai",
        voiceId: resolvedVoiceId,
      },
      transcriber: {
        provider: "deepgram",
        model: transcriberModel,
        language: transcriberLanguage,
      },
      model: {
        provider: "openai",
        model: "gpt-4o-mini",
        systemPrompt: systemPrompt,
      },
      firstMessage: safeFirstMessage,
      // Only include structuredDataSchema when it's a non-empty object with a
      // valid "type" field — Vapi rejects null, undefined, and empty objects.
      analysisPlan: {
        summaryPrompt: "Summarize this call in 2-3 sentences in Spanish. Focus on whether the contact was interested, any objections raised, and the agreed next step.",
        ...(agent.structured_data_schema &&
           typeof agent.structured_data_schema === "object" &&
           !Array.isArray(agent.structured_data_schema) &&
           Object.keys(agent.structured_data_schema).length > 0 &&
           "type" in agent.structured_data_schema
          ? { structuredDataSchema: agent.structured_data_schema }
          : {}),
      },
    },
  };

  // If the agent already has a Vapi assistant ID, prefer using it directly
  // (avoids re-sending the full config on every call)
  if (agent.vapi_assistant_id) {
    vapiBody.assistantId = agent.vapi_assistant_id;
    delete vapiBody.assistant;
  }

  // 4. POST to Vapi
  const vapiKey = vapiCfg.api_key;

  let vapiCallId: string | null = null;
  let vapiStatus = "initiated";

  try {
    const vapiRes = await fetch(VAPI_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${vapiKey}`,
      },
      body: JSON.stringify(vapiBody),
    });

    const vapiData = await vapiRes.json();

    if (!vapiRes.ok) {
      const errMsg = vapiData?.message || vapiData?.error || "Unknown Vapi error";
      console.error(`Vapi API error (${vapiRes.status}):`, JSON.stringify(vapiData));
      return { success: false, error: `Vapi error: ${errMsg}` };
    }

    vapiCallId = vapiData.id || vapiData.callId || null;
    vapiStatus = vapiData.status || "initiated";
    console.log(`Vapi call initiated: ${vapiCallId} for contact ${contactId}`);
  } catch (fetchErr) {
    const msg = `Failed to reach Vapi API: ${fetchErr}`;
    console.error(msg);
    return { success: false, error: msg };
  }

  // 5. Insert call_log
  const { data: callLog, error: insertErr } = await supabase
    .from("call_logs")
    .insert({
      organization_id: organizationId,
      contact_id: contactId,
      campaign_id: campaignId || null,
      calling_agent_id: callingAgentId,
      vapi_call_id: vapiCallId,
      status: vapiStatus,
      direction: "outbound",
      phone_number: contact.primary_phone,
      // metadata
      ...(automationEnrollmentId
        ? { structured_data: { automation_enrollment_id: automationEnrollmentId } }
        : {}),
    })
    .select("id")
    .single();

  if (insertErr) {
    // Non-fatal: call was initiated but we couldn't log it
    console.error("Could not insert call_log:", insertErr.message);
  }

  // 6. Increment campaign counter if applicable
  if (campaignId) {
    await incCampaignCounter(supabase, campaignId, "calls_initiated");
  }

  return {
    success: true,
    callLogId: callLog?.id,
    vapiCallId: vapiCallId ?? undefined,
  };
}

// ── Campaign launcher ─────────────────────────────────────────────────────────

async function launchCampaign(
  supabase: ReturnType<typeof adminClient>,
  campaignId: string,
): Promise<{ success: boolean; initiated: number; skipped: number; errors: string[] }> {
  // 1. Fetch campaign
  const { data: campaign, error: campaignErr } = await supabase
    .from("calling_campaigns")
    .select("id, organization_id, calling_agent_id, contact_ids, status, name")
    .eq("id", campaignId)
    .maybeSingle();

  if (campaignErr || !campaign) {
    return { success: false, initiated: 0, skipped: 0, errors: [`Campaign ${campaignId} not found`] };
  }

  if (campaign.status === "completed") {
    return { success: false, initiated: 0, skipped: 0, errors: ["Campaign is already completed"] };
  }

  const contactIds: string[] = Array.isArray(campaign.contact_ids) ? campaign.contact_ids : [];
  if (contactIds.length === 0) {
    return { success: false, initiated: 0, skipped: 0, errors: ["Campaign has no contacts"] };
  }

  // 2. Update campaign status to active
  await supabase
    .from("calling_campaigns")
    .update({ status: "active" })
    .eq("id", campaignId);

  // 3. Fetch all contacts with a phone number in one query
  const { data: contacts, error: contactsErr } = await supabase
    .from("contacts")
    .select("id, primary_phone")
    .in("id", contactIds)
    .not("primary_phone", "is", null);

  if (contactsErr) {
    console.error("Error fetching campaign contacts:", contactsErr.message);
    return { success: false, initiated: 0, skipped: 0, errors: [contactsErr.message] };
  }

  const dialableContacts = (contacts || []).filter((c) => c.primary_phone);
  const skippedCount = contactIds.length - dialableContacts.length;

  console.log(
    `Campaign ${campaignId}: ${dialableContacts.length} dialable / ${skippedCount} skipped (no phone)`,
  );

  // 4. Fire calls sequentially (max_concurrent=1 as specified)
  //    Each call is awaited before starting the next to avoid overwhelming Vapi
  //    with rapid bursts for the same phone number ID.
  let initiated = 0;
  const errors: string[] = [];

  for (const contact of dialableContacts) {
    const result = await callContact(supabase, {
      contactId: contact.id,
      callingAgentId: campaign.calling_agent_id,
      organizationId: campaign.organization_id,
      campaignId,
    });

    if (result.success) {
      initiated++;
    } else {
      errors.push(`Contact ${contact.id}: ${result.error}`);
    }

    // Brief pause between calls to stay within Vapi rate limits
    if (dialableContacts.indexOf(contact) < dialableContacts.length - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // 5. Update campaign total_contacts with the real count (in case it differs)
  await supabase
    .from("calling_campaigns")
    .update({ total_contacts: contactIds.length })
    .eq("id", campaignId);

  console.log(`Campaign ${campaignId} launched: ${initiated} initiated, ${skippedCount} skipped, ${errors.length} errors`);

  return { success: true, initiated, skipped: skippedCount, errors };
}

// ── Edge Function entrypoint ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Auth check — accept user JWT or service role key (from automation-runner)
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = adminClient();

  // Verify the token belongs to a real user OR is the service role key
  const token = authHeader.slice(7);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  let isAuthorized = token === serviceKey;

  if (!isAuthorized) {
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    isAuthorized = true;
  }

  // Parse body
  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch (_) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { action } = body;

  // ── Action: call_contact ──────────────────────────────────────────────────
  if (action === "call_contact") {
    const { contact_id, calling_agent_id, organization_id, campaign_id, automation_enrollment_id } = body;

    if (!contact_id || !calling_agent_id || !organization_id) {
      return new Response(
        JSON.stringify({ error: "contact_id, calling_agent_id, and organization_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await callContact(supabase, {
      contactId: contact_id,
      callingAgentId: calling_agent_id,
      organizationId: organization_id,
      campaignId: campaign_id || null,
      automationEnrollmentId: automation_enrollment_id || null,
    });

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, call_log_id: result.callLogId, vapi_call_id: result.vapiCallId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── Action: launch_campaign ───────────────────────────────────────────────
  if (action === "launch_campaign") {
    const { campaign_id } = body;

    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await launchCampaign(supabase, campaign_id);

    const status = result.success ? 200 : 422;
    return new Response(JSON.stringify(result), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Unknown action
  return new Response(
    JSON.stringify({ error: `Unknown action: ${action}. Supported: call_contact, launch_campaign` }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
