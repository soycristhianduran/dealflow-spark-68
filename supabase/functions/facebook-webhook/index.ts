import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";
const IG_GRAPH_API = "https://graph.instagram.com/v21.0";

// ── Message splitting helpers (same logic as whatsapp-webhook) ────────────────

function splitResponse(text: string, maxParts = 3, maxLen = 320): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxLen) return [trimmed];

  const paragraphs = trimmed.split(/\n\n+/).map(p => p.trim()).filter(Boolean);

  if (paragraphs.length === 1) {
    return splitAtSentences(trimmed, maxParts, maxLen);
  }

  const chunks: string[] = [];
  let cur = "";

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const candidate = cur ? cur + "\n\n" + p : p;

    if (chunks.length === maxParts - 1) {
      const rest = paragraphs.slice(i).join("\n\n");
      chunks.push((cur ? cur + "\n\n" + rest : rest).trim());
      return chunks;
    }

    if (cur && candidate.length > maxLen) {
      chunks.push(cur.trim());
      cur = p;
    } else {
      cur = candidate;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.slice(0, maxParts);
}

function splitAtSentences(text: string, maxParts: number, maxLen: number): string[] {
  const sentenceRe = /[^.!?]*[.!?]+(?:\s|$)/g;
  const sentences = text.match(sentenceRe) || [text];
  const chunks: string[] = [];
  let cur = "";

  for (const s of sentences) {
    const candidate = cur + s;
    if (cur && candidate.length > maxLen && chunks.length < maxParts - 1) {
      chunks.push(cur.trim());
      cur = s;
    } else {
      cur = candidate;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.slice(0, maxParts);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** IG Business Login tokens ("IGAA...") must use graph.instagram.com. */
function graphHostForToken(token: string | undefined | null): string {
  return token && token.startsWith("IGAA") ? IG_GRAPH_API : GRAPH_API;
}

const STANDARD_COLUMNS = new Set([
  "full_name", "first_name", "last_name", "primary_email", "primary_phone",
  "birthday", "city", "country", "language", "timezone",
  "preferred_channel", "notes", "source", "campaign", "adset", "ad",
  "landing_page", "utm_source", "utm_medium", "utm_campaign", "utm_content",
]);

async function verifySignature(rawBody: string, signatureHeader: string | null, appSecret: string): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = signatureHeader.slice("sha256=".length);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (computed.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// Fire meta_lead_form + contact_created automations via the runner's
// trigger_event path (org-scoped; the runner resolves the contact's org and
// matches automations by form_id). Shared by the new-lead and re-activation
// paths so tagging/steps always run.
async function fireMetaLeadAutomations(
  supabase: any,
  contactId: string,
  formId: string,
  pageId: string,
): Promise<void> {
  const runnerUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/automation-runner`;
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  };
  try {
    await fetch(runnerUrl, {
      method: "POST", headers,
      body: JSON.stringify({
        action: "trigger_event", trigger_type: "meta_lead_form",
        contact_id: contactId, trigger_data: { form_id: formId, page_id: pageId },
      }),
    });
    await fetch(runnerUrl, {
      method: "POST", headers,
      body: JSON.stringify({
        action: "trigger_event", trigger_type: "contact_created",
        contact_id: contactId, trigger_data: { origin: "meta_lead_form", form_id: formId },
      }),
    });
  } catch (e) {
    console.error("fireMetaLeadAutomations error:", e);
  }
}

async function processLeadgenChange(
  supabase: any,
  pageId: string,
  change: any,
): Promise<void> {
  const leadgenId = change.value?.leadgen_id;
  const formId = change.value?.form_id;
  if (!leadgenId || !formId) {
    console.warn("Skipping change without leadgen_id/form_id", change);
    return;
  }

  console.log(`Processing leadgen ${leadgenId} (form ${formId}, page ${pageId})`);

  const { data: pageData, error: pageErr } = await supabase
    .from("facebook_pages")
    .select("user_id, page_access_token")
    .eq("page_id", pageId)
    .limit(1)
    .maybeSingle();

  if (pageErr) {
    console.error(`DB error loading page ${pageId}:`, pageErr);
    return;
  }
  if (!pageData) {
    console.error(`No facebook_pages row for page_id=${pageId}; lead dropped`);
    return;
  }

  const { user_id: userId, page_access_token: pageToken } = pageData;

  // Resolve the user's organization_id so contacts/deals are visible under the correct org
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  const organizationId: string | null = membership?.organization_id ?? null;

  const isTestLead = String(leadgenId).startsWith("TEST_");
  let fields: Record<string, string> = {};

  // Ad attribution (ids + names). Populated from the lead object, then resolved
  // to readable names below.
  let adId: string | null = change.value?.ad_id || null;
  let adsetId: string | null = change.value?.adgroup_id || null;
  let campaignId: string | null = change.value?.campaign_id || null;
  let campaignName: string | null = null, adsetName: string | null = null, adName: string | null = null;

  if (isTestLead) {
    console.log("Test lead detected — using placeholder data");
    fields = {
      full_name: "Lead de Prueba",
      first_name: "Lead",
      last_name: "de Prueba",
      email: `test_${Date.now()}@test.com`,
      phone_number: "+0000000000",
    };
  } else {
    // Request the ad metadata alongside field_data so we can attribute the lead.
    const leadRes = await fetch(`${GRAPH_API}/${leadgenId}?fields=id,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name&access_token=${pageToken}`);
    const leadData = await leadRes.json();
    if (!leadRes.ok) {
      console.error(`Graph API error fetching lead ${leadgenId}:`, JSON.stringify(leadData));
      return;
    }
    for (const fd of leadData.field_data || []) {
      fields[(fd.name || "").toLowerCase()] = (fd.values || [])[0] || "";
    }
    adId = leadData.ad_id || adId;
    adsetId = leadData.adset_id || adsetId;
    campaignId = leadData.campaign_id || campaignId;
    campaignName = leadData.campaign_name || null;
    adsetName = leadData.adset_name || null;
    adName = leadData.ad_name || null;
  }

  // Resolve any missing names (campaign/adset/ad) to readable names via the
  // connector's user token (ads_read), so the lead shows names, not IDs.
  const idsToResolve = [
    campaignId && !campaignName ? campaignId : null,
    adsetId && !adsetName ? adsetId : null,
    adId && !adName ? adId : null,
  ].filter(Boolean) as string[];
  if (idsToResolve.length) {
    try {
      const { data: tok } = await supabase
        .from("facebook_tokens").select("access_token").eq("user_id", userId).maybeSingle();
      const userToken = tok?.access_token;
      if (userToken) {
        const r = await fetch(`${GRAPH_API}/?ids=${idsToResolve.join(",")}&fields=name&access_token=${userToken}`);
        const j = await r.json();
        if (r.ok && j && typeof j === "object") {
          if (campaignId && j[campaignId]?.name) campaignName = j[campaignId].name;
          if (adsetId && j[adsetId]?.name) adsetName = j[adsetId].name;
          if (adId && j[adId]?.name) adName = j[adId].name;
        }
      }
    } catch (_) { /* fall back to IDs */ }
  }

  // Check if this form has a specific pipeline configured
  const { data: formConfig } = await supabase
    .from("facebook_lead_forms")
    .select("pipeline_id")
    .eq("user_id", userId)
    .eq("form_id", formId)
    .maybeSingle();

  const { data: userMappings } = await supabase
    .from("facebook_field_mappings")
    .select("fb_field_name, contact_field, is_custom_field")
    .eq("user_id", userId)
    .eq("form_id", formId);

  const hasCustomMappings = userMappings && userMappings.length > 0;

  const contactData: Record<string, any> = {
    source: "facebook_ads",
    campaign: campaignName || campaignId || null,
    adset: adsetName || adsetId || null,
    ad: adName || adId || null,
    meta_campaign_id: campaignId,
    meta_adset_id: adsetId,
    meta_ad_id: adId,
    status: "new",
    owner_id: userId,
    organization_id: organizationId,
  };
  const customFields: Record<string, string> = {};

  if (hasCustomMappings) {
    for (const mapping of userMappings!) {
      const value = fields[mapping.fb_field_name.toLowerCase()] || "";
      if (!value) continue;
      if (mapping.is_custom_field) {
        customFields[mapping.contact_field] = value;
      } else if (STANDARD_COLUMNS.has(mapping.contact_field)) {
        contactData[mapping.contact_field] = value;
      }
    }
  } else {
    contactData.first_name = fields["first_name"] || fields["nombre"] || null;
    contactData.last_name = fields["last_name"] || fields["apellido"] || fields["apellidos"] || null;
    contactData.primary_email = fields["email"] || fields["correo"] || fields["correo_electrónico"] || null;
    contactData.primary_phone = fields["phone_number"] || fields["telefono"] || fields["teléfono"] || fields["phone"] || fields["número_de_teléfono"] || null;
    contactData.birthday = fields["date_of_birth"] || fields["fecha_de_nacimiento"] || fields["birthday"] || null;
    contactData.city = fields["city"] || fields["ciudad"] || null;
    contactData.country = fields["country"] || fields["país"] || null;

    if (!contactData.first_name) {
      const fullNameRaw = fields["full_name"] || fields["nombre_completo"] || fields["name"] || "";
      if (fullNameRaw) {
        const parts = fullNameRaw.trim().split(/\s+/);
        contactData.first_name = parts[0] || null;
        contactData.last_name = parts.slice(1).join(" ") || null;
      }
    }
  }

  contactData.full_name = [contactData.first_name, contactData.last_name].filter(Boolean).join(" ") || "Lead Facebook";
  if (Object.keys(customFields).length > 0) {
    contactData.custom_fields = customFields;
  }

  // Match an existing lead by NORMALIZED phone (digits-only) or email so the
  // same person arriving from another channel (e.g. WhatsApp first, then a Meta
  // Lead Form) is recognized even when the phone is stored in a different format.
  let existingContactId: string | null = null;
  if (organizationId && (contactData.primary_email || contactData.primary_phone)) {
    const { data: matchId } = await supabase.rpc("match_contact", {
      p_org: organizationId,
      p_phone: contactData.primary_phone || null,
      p_email: contactData.primary_email || null,
    });
    existingContactId = (matchId as string) || null;
  }

  if (existingContactId) {
    console.log(`Lead ${leadgenId} already exists as contact ${existingContactId} — re-activating as new opportunity`);

    // ── Patch contact with any new data from the form ──────────────────────
    const patch: Record<string, any> = {};
    if (contactData.primary_email && !contactData.primary_email.includes("@")) {} // skip invalid
    else if (contactData.primary_email) patch.primary_email = contactData.primary_email;
    if (contactData.primary_phone) patch.primary_phone = contactData.primary_phone;
    if (contactData.first_name)    patch.first_name    = contactData.first_name;
    if (contactData.last_name)     patch.last_name     = contactData.last_name;
    if (Object.keys(patch).length) {
      await supabase.from("contacts").update(patch).eq("id", existingContactId)
        .catch((e: any) => console.warn("Could not patch existing contact:", e));
    }

    // ── Re-assign to pipeline/stage (treat as fresh lead) ─────────────────
    const { data: pipeline } = formConfig?.pipeline_id
      ? await supabase.from("pipelines").select("id").eq("id", formConfig.pipeline_id).maybeSingle()
      : await supabase.from("pipelines").select("id").eq("organization_id", organizationId).order("created_at", { ascending: true }).limit(1).maybeSingle();

    if (pipeline) {
      const { data: stage } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("pipeline_id", pipeline.id)
        .order("order", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (stage) {
        await supabase.from("contacts")
          .update({ pipeline_id: pipeline.id, stage_id: stage.id, lead_status: "active" })
          .eq("id", existingContactId)
          .catch((e: any) => console.warn("Could not re-assign pipeline:", e));
      }
    }

    // ── Log activity with context: returning lead, new form submission ─────
    await supabase.from("activities").insert({
      related_entity_type: "contact",
      related_entity_id: existingContactId,
      event_type: "note",
      event_source: "facebook_lead_form",
      summary: `🔁 Lead existente volvió a interactuar — nuevo formulario de Meta\nFormulario: ${formId} · Lead ID: ${leadgenId}\nContacto reactivado como nueva oportunidad.`,
    }).catch((e: any) => console.warn("Could not log re-activation activity:", e));

    // ── Fire automations via the runner (org-scoped trigger_event) ──────────
    await fireMetaLeadAutomations(supabase, existingContactId, formId, pageId);

    return;
  }

  const { data: newContact, error: contactErr } = await supabase
    .from("contacts")
    .insert(contactData)
    .select("id")
    .single();

  if (contactErr || !newContact) {
    console.error(`Error creating contact from lead ${leadgenId}:`, contactErr);
    return;
  }
  console.log(`Created contact ${newContact.id} from lead ${leadgenId}`);

  // ── Fire automations IMMEDIATELY after creating the contact ─────────────────
  // IMPORTANT: this runs BEFORE the pipeline/stage logic below, which has early
  // `return`s (no pipeline / no stages). Previously the automation firing lived
  // AFTER that logic, so any lead whose pipeline/stage resolution returned early
  // never triggered the flow (e.g. add_tag never ran). Firing here guarantees
  // meta_lead_form automations always run, regardless of pipeline config.
  await fireMetaLeadAutomations(supabase, newContact.id, formId, pageId);

  const { data: pipeline } = formConfig?.pipeline_id
    ? await supabase.from("pipelines").select("id").eq("id", formConfig.pipeline_id).maybeSingle()
    : await supabase.from("pipelines").select("id").eq("organization_id", organizationId).order("created_at", { ascending: true }).limit(1).maybeSingle();

  if (!pipeline) {
    console.warn(`No pipeline configured — contact created without deal (${newContact.id})`);
    return;
  }

  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", pipeline.id)
    .order("order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!stage) {
    console.warn(`Pipeline ${pipeline.id} has no stages — contact created without deal`);
    return;
  }

  // Leads+Deals Unification: contacts ARE the pipeline entity — update the
  // contact row with pipeline/stage instead of creating a separate deal.
  const { error: stageErr } = await supabase
    .from("contacts")
    .update({ pipeline_id: pipeline.id, stage_id: stage.id })
    .eq("id", newContact.id);

  if (stageErr) {
    console.error(`Error assigning pipeline/stage to contact ${newContact.id}:`, stageErr);
  } else {
    console.log(`Assigned contact ${newContact.id} → pipeline ${pipeline.id}, stage ${stage.id}`);
    // Activity log so the timeline shows the initial stage assignment
    await supabase.from("activities").insert({
      related_entity_type: "contact",
      related_entity_id: newContact.id,
      event_type: "stage_changed",
      event_source: "facebook_lead_form",
      summary: `Contacto creado desde Facebook Lead Form`,
    }).catch((e: any) => console.warn("Could not log activity:", e));
  }

}

// ============================================================================
// INSTAGRAM EVENT HANDLERS
// ============================================================================

/**
 * Find the user_id that owns a given IG account, by either ig_user_id OR
 * the FB page_id that hosts the IG account.  Returns null if not found
 * (e.g., webhook fired for an account no user has connected to the CRM).
 */
async function findIgAccountByIgUserId(
  supabase: any,
  igUserId: string,
): Promise<{ id: string; user_id: string; page_id: string | null; organization_id: string | null; page_access_token: string } | null> {
  const { data } = await supabase
    .from("instagram_accounts")
    .select("id, user_id, page_id, organization_id, page_access_token")
    .eq("ig_user_id", igUserId)
    .eq("is_active", true)
    .maybeSingle();
  return data ?? null;
}

async function findIgAccountByPageId(
  supabase: any,
  pageId: string,
): Promise<{ id: string; user_id: string; ig_user_id: string; page_access_token: string } | null> {
  const { data } = await supabase
    .from("instagram_accounts")
    .select("id, user_id, ig_user_id, page_access_token")
    .eq("page_id", pageId)
    .eq("is_active", true)
    .maybeSingle();
  return data ?? null;
}

/**
 * Resolve an IGSID (Instagram-Scoped ID) to a real username / name /
 * profile picture via the Graph API, then update the conversation row.
 *
 * Meta's webhook payload only contains the IGSID, not the username — so
 * without this step every IG conversation in the CRM would display as a
 * meaningless numeric ID.  We skip the API call if the conversation
 * already has a username (avoids redundant calls on every incoming DM).
 *
 * Requires the page access token to have `instagram_manage_messages`.
 */
async function resolveIgParticipantInfo(
  supabase: any,
  conversationId: string,
  igsid: string,
  pageAccessToken: string,
): Promise<void> {
  // Skip if already resolved — common case after the first DM
  const { data: existing } = await supabase
    .from("instagram_conversations")
    .select("participant_username, participant_name")
    .eq("id", conversationId)
    .maybeSingle();
  if (existing?.participant_username || existing?.participant_name) return;

  try {
    const r = await fetch(
      `${graphHostForToken(pageAccessToken)}/${igsid}?fields=name,username,profile_pic&access_token=${encodeURIComponent(pageAccessToken)}`,
    );
    const data = await r.json();
    if (data.error) {
      console.warn(`resolveIgParticipantInfo: Meta error for IGSID ${igsid}:`, JSON.stringify(data.error));
      return;
    }
    if (!data.username && !data.name) return;
    await supabase
      .from("instagram_conversations")
      .update({
        participant_username: data.username || null,
        participant_name: data.name || null,
        participant_profile_pic: data.profile_pic || null,
      })
      .eq("id", conversationId);
    console.log(`Resolved IG participant ${igsid} → @${data.username || data.name}`);
  } catch (e) {
    console.warn("resolveIgParticipantInfo threw:", e);
  }
}

/**
 * Upsert a conversation row for a given IG account + participant (the user
 * on the other side of the DM).  Returns the conversation id.
 */
async function upsertIgConversation(
  supabase: any,
  args: {
    user_id: string;
    ig_account_id: string;
    participant_id: string;
    participant_username?: string | null;
    last_message_at: string;
    last_message_preview: string;
    increment_unread: boolean;
  },
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("instagram_conversations")
    .select("id, unread_count")
    .eq("user_id", args.user_id)
    .eq("ig_account_id", args.ig_account_id)
    .eq("participant_id", args.participant_id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("instagram_conversations")
      .update({
        last_message_at: args.last_message_at,
        last_message_preview: args.last_message_preview,
        unread_count: args.increment_unread ? (existing.unread_count ?? 0) + 1 : existing.unread_count,
        participant_username: args.participant_username ?? undefined,
      })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data: inserted } = await supabase
    .from("instagram_conversations")
    .insert({
      user_id: args.user_id,
      ig_account_id: args.ig_account_id,
      participant_id: args.participant_id,
      participant_username: args.participant_username ?? null,
      last_message_at: args.last_message_at,
      last_message_preview: args.last_message_preview,
      unread_count: args.increment_unread ? 1 : 0,
    })
    .select("id")
    .single();

  return inserted?.id ?? null;
}

/**
 * Process an Instagram DM event from the Messenger-style payload format
 * (when object=page and entry.messaging[] is present).
 */
async function processInstagramMessenger(
  supabase: any,
  pageId: string,
  event: any,
): Promise<void> {
  const senderId = event.sender?.id;
  const recipientId = event.recipient?.id;
  if (!senderId || !recipientId) {
    console.warn("IG messenger event without sender/recipient:", event);
    return;
  }

  // Find which IG account this belongs to.  In the messenger format the
  // recipient.id is the IG business account ID (ig_user_id).
  const account = await findIgAccountByIgUserId(supabase, recipientId);
  if (!account) {
    console.log(`No IG account configured for ig_user_id=${recipientId}; ignoring DM`);
    return;
  }

  // Node to SEND replies from. Page token → PAGE id on graph.facebook.com;
  // IG Login token (IGAA) → ig_user_id on graph.instagram.com. Sending from the
  // ig_user_id on graph.facebook.com returns Meta error #3 ("capability"), which
  // silently broke every auto-reply below (story replies, follower-gate lead
  // magnet delivery, AI replies).
  const sendFromNode = account.page_access_token?.startsWith("IGAA")
    ? recipientId
    : (account.page_id || recipientId);

  // Read message contents
  const msg = event.message;
  if (!msg) {
    // Could be a postback, read, delivery — log and skip
    if (event.postback) console.log("IG postback:", JSON.stringify(event.postback));
    return;
  }
  // Echoes: messages WE sent that Meta echoes back.  Skip — we already stored them on send.
  if (msg.is_echo) return;

  const messageText = msg.text ?? "";
  const attachmentUrl = msg.attachments?.[0]?.payload?.url ?? null;
  const messageType = msg.attachments?.[0]?.type ?? "text";
  const igMessageId = msg.mid ?? null;
  const timestamp = event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString();

  // Detect if this is a story reply (Meta wraps it inside message.reply_to.story)
  const storyReply = msg.reply_to?.story ?? null;
  const isStoryReply = !!storyReply;

  const conversationId = await upsertIgConversation(supabase, {
    user_id: account.user_id,
    ig_account_id: account.id,
    participant_id: senderId,
    last_message_at: timestamp,
    last_message_preview: isStoryReply
      ? `📖 Respondió tu story: ${messageText.substring(0, 150) || "[adjunto]"}`
      : (messageText.substring(0, 200) || `[${messageType}]`),
    increment_unread: true,
  });

  // Best-effort: enrich the conversation with @username / display name /
  // avatar so the CRM doesn't show a raw IGSID.  Skipped if already resolved.
  if (conversationId) {
    await resolveIgParticipantInfo(supabase, conversationId, senderId, account.page_access_token);
  }

  await supabase.from("instagram_messages").insert({
    user_id: account.user_id,
    conversation_id: conversationId,
    ig_account_id: account.id,
    ig_message_id: igMessageId,
    direction: "incoming",
    message_type: isStoryReply ? "story_reply" : messageType,
    message_text: messageText || null,
    attachment_url: attachmentUrl ?? (storyReply?.url || null),
    sender_id: senderId,
    recipient_id: recipientId,
    status: "received",
    received_at: timestamp,
    sent_at: timestamp,
  });

  console.log(`IG ${isStoryReply ? "story reply" : "DM"} stored: from=${senderId} text=${messageText.substring(0, 60)}`);

  // ── Story reply automations ────────────────────────────────────────────────
  if (isStoryReply) {
    try {
      const { data: storyAutos } = await supabase
        .from("instagram_comment_automations")
        .select("*")
        .eq("user_id", account.user_id)
        .eq("ig_account_id", account.id)
        .contains("trigger_types", ["story_reply"])
        .eq("is_active", true);

      if (storyAutos && storyAutos.length > 0) {
        const lowerReply = messageText.toLowerCase();
        const isFollower: boolean = event.sender?.is_follower === true;

        for (const auto of storyAutos) {
          // Keyword match (optional — empty keywords = match any story reply)
          const keywords: string[] = (auto.keywords || []).map((k: string) => k.toLowerCase());
          let matches = keywords.length === 0;
          if (!matches) {
            if (auto.match_mode === "exact") matches = keywords.some((k) => lowerReply.trim() === k);
            else if (auto.match_mode === "all") matches = keywords.every((k) => lowerReply.includes(k));
            else matches = keywords.some((k) => lowerReply.includes(k));
          }
          if (!matches) continue;

          const igToken = account.page_access_token;
          const igHost = igToken?.startsWith("IGAA")
            ? "https://graph.instagram.com/v21.0"
            : "https://graph.facebook.com/v21.0";

          const sendDm = async (text: string, buttons?: any[] | null) => {
            const r = await fetch(`${igHost}/${sendFromNode}/messages`, {
              method: "POST",
              headers: { "Authorization": `Bearer ${igToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({ recipient: { id: senderId }, message: buildIgMessageBody(text, buttons) }),
            });
            const d = await r.json();
            if (d.error) console.error("story_reply DM failed:", JSON.stringify(d.error));
            else {
              await supabase.from("instagram_messages").insert({
                user_id: account.user_id, conversation_id: conversationId,
                ig_account_id: account.id, direction: "outgoing", message_type: "text",
                message_text: text, sender_id: recipientId, recipient_id: senderId,
                status: "sent", sent_at: new Date().toISOString(), received_at: new Date().toISOString(),
              });
            }
            return !d.error;
          };

          if (auto.require_follower && auto.dm_message_non_follower) {
            if (isFollower) {
              if (auto.dm_message_text) await sendDm(auto.dm_message_text, auto.dm_buttons);
            } else {
              const sent = await sendDm(auto.dm_message_non_follower, auto.dm_buttons_non_follower);
              if (sent && auto.dm_message_text) {
                const { data: ex } = await supabase
                  .from("instagram_pending_deliveries")
                  .select("id").eq("ig_account_id", account.id)
                  .eq("commenter_id", senderId).eq("status", "waiting_follow").maybeSingle();
                if (!ex) {
                  await supabase.from("instagram_pending_deliveries").insert({
                    user_id: account.user_id, ig_account_id: account.id,
                    automation_id: auto.id, commenter_id: senderId,
                    dm_text: auto.dm_message_text,
                  });
                }
              }
            }
          } else if (auto.dm_message_text) {
            await sendDm(auto.dm_message_text, auto.dm_buttons);
          }

          await supabase.from("instagram_comment_automations")
            .update({ trigger_count: (auto.trigger_count ?? 0) + 1, last_triggered_at: new Date().toISOString() })
            .eq("id", auto.id);
          break;
        }
      }
    } catch (e) {
      console.warn("Story reply automation error (non-fatal):", e);
    }
  }

  // ── Follower-gate: check pending deliveries on EVERY incoming DM ─────────
  // Meta includes sender.is_follower in DM webhooks — most reliable follower check.
  // Two cases:
  //   A) sender IS follower   + pending delivery → deliver lead magnet ✅
  //   B) sender is NOT follower + pending delivery → re-send "please follow" message 🔁
  try {
    const { data: pending } = await supabase
      .from("instagram_pending_deliveries")
      .select("*, automation:automation_id(*)")
      .eq("ig_account_id", account.id)
      .eq("commenter_id", senderId)
      .in("status", ["waiting_follow", "ready_to_deliver"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (pending) {
      // sender.is_follower is the most reliable follower signal — available on every DM
      // webhook without any special permissions. We use it as the single source of truth.
      const isNowFollower: boolean = event.sender?.is_follower === true;
      const igToken = account.page_access_token;
      const igHost = graphHostForToken(igToken);
      console.log(`[follower-gate DM] sender=${senderId} is_follower=${isNowFollower} status=${pending.status}`);

      if (isNowFollower) {
        // ── A) Confirmed follower → deliver lead magnet ──────────────────────
        const auto = pending.automation;
        const resourceButtons = auto?.dm_buttons ?? null;
        const sendRes = await fetch(`${igHost}/${sendFromNode}/messages`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${igToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { id: senderId },
            message: buildIgMessageBody(pending.dm_text, resourceButtons),
          }),
        });
        const sendData = await sendRes.json();

        if (!sendData.error) {
          await supabase
            .from("instagram_pending_deliveries")
            .update({ status: "delivered", delivered_at: new Date().toISOString() })
            .eq("id", pending.id);

          await supabase.from("instagram_messages").insert({
            user_id: account.user_id,
            conversation_id: conversationId,
            ig_account_id: account.id,
            direction: "outgoing",
            message_type: "text",
            message_text: pending.dm_text,
            sender_id: recipientId,
            recipient_id: senderId,
            status: "sent",
            sent_at: new Date().toISOString(),
            received_at: new Date().toISOString(),
            is_ai_generated: false,
          });

          console.log(`[follower-gate DM] ✅ Delivered lead magnet to ${senderId}`);
          return; // Done — skip AI agent
        } else {
          console.error("[follower-gate DM] Delivery failed:", JSON.stringify(sendData.error));
        }
      } else {
        // ── B) Still not following → re-send the "please follow" message ────
        const auto = pending.automation;
        if (auto?.dm_message_non_follower) {
          // Resolve the sender's @username so {{username}}/{{nombre}} aren't blank.
          let nfUsername: string | null = null;
          try {
            const ur = await fetch(`${igHost}/${senderId}?fields=username&access_token=${encodeURIComponent(igToken)}`);
            const ud = await ur.json();
            if (ud?.username) nfUsername = ud.username;
          } catch (_) { /* best-effort */ }
          const nonFollowerText = resolveVars(auto.dm_message_non_follower, nfUsername, null);
          const sendRes = await fetch(`${igHost}/${sendFromNode}/messages`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${igToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              recipient: { id: senderId },
              message: buildIgMessageBody(nonFollowerText, auto.dm_buttons_non_follower ?? null),
            }),
          });
          const sendData = await sendRes.json();
          if (sendData.error) {
            console.error("[follower-gate DM] Re-send non-follower msg failed:", JSON.stringify(sendData.error));
          } else {
            console.log(`[follower-gate DM] 🔁 Re-sent non-follower message to ${senderId}`);
          }
          return; // Skip AI agent — we handled this DM
        }
      }
    }
  } catch (e) {
    console.warn("[follower-gate DM] Error (non-fatal):", e);
  }

  // ── AI Agent: respond automatically if enabled ────────────────────────────
  // Awaited inline so it completes within the outer EdgeRuntime.waitUntil work promise.
  try {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", account.user_id)
      .maybeSingle();

    if (membership?.organization_id) {
      // Fetch last 12 messages for context (13 rows, skip index 0 = current message)
      const { data: recentMsgs } = await supabase
        .from("instagram_messages")
        .select("direction, message_text, message_type")
        .eq("user_id", account.user_id)
        .eq("sender_id", senderId)
        .order("sent_at", { ascending: false })
        .limit(13);

      // Skip index 0 (current message just inserted) to avoid duplicate context
      const history = (recentMsgs || [])
        .slice(1)
        .reverse()
        .map((m: any) => ({
          role: m.direction === "incoming" ? "user" : "assistant",
          content: m.message_text || `[${m.message_type}]`,
        }));

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const agentRes = await fetch(`${supabaseUrl}/functions/v1/ai-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          channel: "instagram",
          organization_id: membership.organization_id,
          user_id: account.user_id,
          session_key: senderId,
          message: { type: messageType, content: messageText, media_url: attachmentUrl },
          recent_messages: history,
        }),
      });

      const agentData = await agentRes.json();
      console.log("IG AI agent response:", JSON.stringify(agentData).substring(0, 200));

      if (agentData?.response) {
        // Split long responses into multiple short messages
        const parts = splitResponse(agentData.response);

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (i > 0) await sleep(700);

          // Send directly via Meta Graph API (avoids inter-function auth issues)
          const igToken = account.page_access_token;
          const igHost = igToken?.startsWith("IGAA")
            ? "https://graph.instagram.com/v21.0"
            : "https://graph.facebook.com/v21.0";
          const sendRes = await fetch(`${igHost}/${sendFromNode}/messages`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${igToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              recipient: { id: senderId },
              message: { text: part },
            }),
          });
          const sendData = await sendRes.json();
          if (sendData.error) {
            console.error("IG AI send_dm failed:", JSON.stringify(sendData.error));
          }

          // Save this part to DB
          await supabase.from("instagram_messages").insert({
            user_id: account.user_id,
            conversation_id: conversationId,
            ig_account_id: account.id,
            direction: "outgoing",
            message_type: "text",
            message_text: part,
            sender_id: recipientId,
            recipient_id: senderId,
            status: "sent",
            sent_at: new Date().toISOString(),
            received_at: new Date().toISOString(),
            is_ai_generated: true,
          });
        }

        if (agentData.escalated) {
          console.log(`IG AI agent escalated conversation with ${senderId}`);
        }
      }
    }
  } catch (e) {
    console.warn("IG AI agent error (non-fatal):", e);
  }
}

/**
 * Process an Instagram DM change when it arrives as object=instagram with
 * field=messages in entry.changes[] (Instagram Login flow format).
 */
async function processInstagramDirectChange(
  supabase: any,
  igUserId: string,
  change: any,
): Promise<void> {
  // The value shape mirrors Messenger events
  const value = change.value;
  if (!value) return;

  // Some payloads come wrapped as a list, others as single events
  const events: any[] = Array.isArray(value) ? value : [value];
  for (const ev of events) {
    await processInstagramMessenger(supabase, igUserId, ev);
  }
}

// ── Template variable resolver ────────────────────────────────────────────────
/**
 * Replace {{nombre}} and {{username}} in a message template.
 * - {{nombre}}   → display name from IG profile, or @handle fallback
 * - {{username}} → @handle (legacy, kept for compatibility)
 */
function resolveVars(text: string, username: string | null, displayName: string | null): string {
  const handle = username ? `@${username}` : "";
  const name = displayName || handle;
  return text
    .replace(/\{\{nombre\}\}/gi, name)
    .replace(/\{\{username\}\}/gi, handle);
}

// ── Follower check helper ─────────────────────────────────────────────────────
/**
 * Try to determine whether `commenterIgUserId` follows the IG account
 * identified by `igUserId`.
 *
 * Meta's Graph API exposes this via the Messenger webhook (sender.is_follower)
 * for DM events.  For COMMENT events there is no direct `is_follower` field,
 * so we use the business_discovery endpoint as a best-effort check.
 *
 * Returns:
 *   true  — confirmed follower
 *   false — confirmed NOT a follower
 *   null  — could not determine (API error / missing permission)
 */
async function checkIsFollower(
  _igUserId: string,
  commenterIgUserId: string,
  pageAccessToken: string,
): Promise<boolean | null> {
  try {
    const graphHost = graphHostForToken(pageAccessToken);
    const url = `${graphHost}/${commenterIgUserId}?fields=is_following_business&access_token=${encodeURIComponent(pageAccessToken)}`;
    console.log(`[checkIsFollower] GET ${graphHost}/${commenterIgUserId}?fields=is_following_business`);
    const res = await fetch(url);
    const data = await res.json();
    console.log(`[checkIsFollower] response:`, JSON.stringify(data).substring(0, 300));
    if (data.error) {
      console.warn("[checkIsFollower] API error:", JSON.stringify(data.error));
      return null; // cannot determine
    }
    if (typeof data.is_following_business === "boolean") {
      console.log(`[checkIsFollower] is_following_business =`, data.is_following_business);
      return data.is_following_business;
    }
    console.warn("[checkIsFollower] field missing in response:", JSON.stringify(data));
    return null;
  } catch (e) {
    console.warn("[checkIsFollower] threw:", e);
    return null;
  }
}

/**
 * Build the message body for a Meta IG DM.
 *
 * Uses Generic Template (nice button UI) for non-Instagram URLs.
 * instagram.com URLs are skipped from buttons (opening instagram.com inside
 * Instagram's own in-app WebView causes an infinite-loading loop) and
 * instead appended as plain-text links at the end of the message — Instagram
 * renders them as tappable links opening in Safari/Chrome.
 *
 * buttons: [{ title: string, url: string }] — max 3
 */
function buildIgMessageBody(text: string, buttons?: { title: string; url: string }[] | null): any {
  const validBtns = (buttons || []).filter(b => b.title && b.url);
  if (validBtns.length === 0) {
    return { text };
  }

  const isIgUrl = (url: string) =>
    /instagram\.com/i.test(url) || url.startsWith("instagram://");

  // Separate: external URLs → Generic Template buttons (work fine)
  //           instagram.com URLs → skip entirely (can't navigate inside Instagram's WebView)
  const externalBtns = validBtns.filter(b => !isIgUrl(b.url)).slice(0, 3);

  if (externalBtns.length === 0) {
    // All buttons were instagram.com — send plain text only
    return { text };
  }

  // Generic Template: use the original text (NOT modified) for title/subtitle
  // so the message reads cleanly without raw URLs mixed in.
  const title = text.substring(0, 80);
  const subtitle = text.length > 80 ? text.substring(80, 200) : undefined;
  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "generic",
        elements: [{
          title,
          ...(subtitle ? { subtitle } : {}),
          buttons: externalBtns.map(b => ({
            type: "web_url",
            url: b.url,
            title: b.title.substring(0, 20),
          })),
        }],
      },
    },
  };
}

/**
 * Send a private DM using the "Private Reply" flow that Meta offers for
 * comment-originated conversations (uses comment_id as recipient identifier).
 */
async function sendCommentDm(
  igUserId: string,
  pageId: string | null,
  commentId: string,
  text: string,
  pageAccessToken: string,
  buttons?: { title: string; url: string }[] | null,
): Promise<{ success: boolean; recipientId?: string }> {
  // Private Reply node: IG Login token (IGAA) → ig_user_id on graph.instagram.com;
  // Page token → PAGE id on graph.facebook.com. Posting to ig_user_id on
  // graph.facebook.com returns Meta error #3 ("capability") → the DM silently
  // failed to send, which is exactly why comment-triggered DMs weren't arriving.
  const isIgLogin = !!pageAccessToken && pageAccessToken.startsWith("IGAA");
  const graphHost = isIgLogin ? "https://graph.instagram.com/v21.0" : "https://graph.facebook.com/v21.0";
  const sendNodeId = isIgLogin ? igUserId : (pageId || igUserId);
  const res = await fetch(`${graphHost}/${sendNodeId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${pageAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: buildIgMessageBody(text, buttons),
    }),
  });
  const data = await res.json();
  if (data.error) {
    console.error("sendCommentDm failed:", JSON.stringify(data.error));
    return { success: false };
  }
  return { success: true, recipientId: data.recipient_id };
}

/**
 * Process a comment event.  Stores the comment + runs any matching
 * comment-to-DM automations, including the follower-gate flow:
 *
 *   require_follower = TRUE:
 *     IS follower    → send dm_message_text (lead magnet / resource)
 *     NOT follower   → send dm_message_non_follower ("please follow first")
 *                      + save instagram_pending_deliveries row
 *
 *   require_follower = FALSE (default):
 *     → always send dm_message_text
 */
async function processInstagramComment(
  supabase: any,
  entryId: string,
  change: any,
): Promise<void> {
  const value = change.value;
  if (!value) return;

  const commentId = value.id;
  const mediaId = value.media?.id;
  const parentCommentId = value.parent_id ?? null;
  const commenterId = value.from?.id;          // IG user ID (not IGSID)
  const commenterUsername = value.from?.username ?? null;
  const text: string = value.text ?? "";

  if (!commentId || !mediaId || !commenterId) {
    console.warn("Incomplete comment payload, skipping:", JSON.stringify(value).substring(0, 300));
    return;
  }

  // Find IG account.  entryId in object=instagram payloads is the IG user id.
  const account = await findIgAccountByIgUserId(supabase, entryId);
  if (!account) {
    console.log(`No IG account configured for ig_user_id=${entryId}; ignoring comment`);
    return;
  }

  // Don't store comments WE posted (replies to our own comments)
  if (commenterId === entryId) {
    console.log("Skipping self-authored comment");
    return;
  }

  // Persist the comment with an IDEMPOTENCY guard. Meta frequently redelivers
  // the same comment webhook (retries / at-least-once delivery). We insert with
  // ON CONFLICT DO NOTHING on the unique comment_id: if a row comes back it's
  // the FIRST time we see this comment → run automations. If nothing comes back
  // the comment was already processed → skip, so the public reply and DM don't
  // fire twice.
  const { data: insertedComment } = await supabase
    .from("instagram_comments")
    .upsert(
      {
        user_id: account.user_id,
        organization_id: account.organization_id,
        ig_account_id: account.id,
        comment_id: commentId,
        parent_comment_id: parentCommentId,
        media_id: mediaId,
        commenter_id: commenterId,
        commenter_username: commenterUsername,
        text,
      },
      { onConflict: "comment_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();

  if (!insertedComment) {
    console.log(`[comment] Duplicate delivery for comment_id=${commentId} — already processed, skipping automations`);
    return;
  }

  // ----- Run matching automations ------------------------------------------
  const { data: automations } = await supabase
    .from("instagram_comment_automations")
    .select("*")
    .eq("user_id", account.user_id)
    .eq("ig_account_id", account.id)
    .eq("is_active", true)
    .contains("trigger_types", ["comment"]);

  if (!automations || automations.length === 0) return;

  const lowerText = text.toLowerCase();

  for (const auto of automations) {
    // Filter by media_ids array (new) or legacy media_id
    const targetIds: string[] = auto.media_ids?.length
      ? auto.media_ids
      : (auto.media_id ? [auto.media_id] : []);
    if (targetIds.length > 0 && !targetIds.includes(mediaId)) continue;

    // Match keywords
    const keywords: string[] = (auto.keywords || []).map((k: string) => k.toLowerCase());
    let matches = false;
    if (keywords.length === 0) {
      matches = true; // no keywords = match all
    } else if (auto.match_mode === "exact") {
      matches = keywords.some((k) => lowerText.trim() === k);
    } else if (auto.match_mode === "all") {
      matches = keywords.every((k) => lowerText.includes(k));
    } else {
      matches = keywords.some((k) => lowerText.includes(k));
    }
    if (!matches) continue;

    const rv = (t: string) => resolveVars(t, commenterUsername ?? null, null);

    // 1) Public reply on the comment (always fires regardless of follower status)
    if (auto.reply_to_comment_text) {
      try {
        const replyText = rv(auto.reply_to_comment_text);
        // Use the correct host based on the token type (IGAA = Instagram Graph API)
        const replyHost = graphHostForToken(account.page_access_token);
        console.log(`[comment-reply] Posting reply to ${replyHost}/${commentId}/replies — text: "${replyText.substring(0, 60)}"`);
        const res = await fetch(`${replyHost}/${commentId}/replies`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${account.page_access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: replyText }),
        });
        const data = await res.json();
        if (data.error) {
          console.error("[comment-reply] FAILED:", JSON.stringify(data.error));
        } else {
          console.log("[comment-reply] OK — reply id:", data.id);
          await supabase
            .from("instagram_comments")
            .update({ is_replied: true, matched_automation_id: auto.id })
            .eq("comment_id", commentId);
        }
      } catch (e) {
        console.error("[comment-reply] Exception:", e);
      }
    }

    // 2) DM logic — with optional follower gate
    if (auto.dm_message_text || auto.dm_message_non_follower) {
      try {
        if (auto.require_follower && auto.dm_message_non_follower) {
          // ── FOLLOWER-GATED flow ──────────────────────────────────────────
          const isFollower = await checkIsFollower(
            entryId,
            commenterId,
            account.page_access_token,
          );
          console.log(`[follower-gate] commenter=${commenterId} isFollower=${isFollower} auto=${auto.id}`);

          if (isFollower === true) {
            // Confirmed follower — deliver lead magnet immediately.
            const dmText = rv(auto.dm_message_text ?? "");
            const { success } = await sendCommentDm(entryId, account.page_id, commentId, dmText, account.page_access_token, auto.dm_buttons);
            if (success) {
              await supabase.from("instagram_comments")
                .update({ is_dm_sent: true, matched_automation_id: auto.id })
                .eq("comment_id", commentId);
              console.log(`[follower-gate] ✅ Follower confirmed — lead magnet sent to ${commenterId}`);
            }
          } else {
            // Not a follower, OR couldn't verify (null = API error / permission not approved).
            // In both cases send the "please follow" message and save a pending delivery.
            // When the user later DMs us, sender.is_follower=true triggers delivery.
            console.log(`[follower-gate] ⛔ Non-follower (or unverifiable) — sending non-follower message to ${commenterId}`);

            // Generate (or reuse) a pending delivery so we have a verify_token for the button URL
            const dmResourceText = rv(auto.dm_message_text ?? "");
            let verifyToken: string | null = null;

            if (auto.dm_message_text) {
              const { data: existing } = await supabase
                .from("instagram_pending_deliveries")
                .select("id, verify_token")
                .eq("ig_account_id", account.id)
                .eq("commenter_id", commenterId)
                .eq("status", "waiting_follow")
                .maybeSingle();

              if (existing) {
                verifyToken = existing.verify_token;
              } else {
                const { data: inserted } = await supabase
                  .from("instagram_pending_deliveries")
                  .insert({
                    user_id: account.user_id,
                    ig_account_id: account.id,
                    automation_id: auto.id,
                    commenter_id: commenterId,
                    commenter_username: commenterUsername,
                    dm_text: dmResourceText,
                  })
                  .select("verify_token")
                  .single();
                verifyToken = inserted?.verify_token ?? null;
                console.log(`[follower-gate] Pending delivery saved — token=${verifyToken}`);
              }
            }

            // Build non-follower buttons, auto-injecting the verify button if token exists
            const baseButtons: { title: string; url: string }[] = auto.dm_buttons_non_follower || [];
            const verifyUrl = verifyToken
              ? `https://app.klosify.com/ig/verify/${verifyToken}`
              : null;
            // If no verify button already, prepend it automatically
            const hasVerifyBtn = baseButtons.some((b) =>
              b.url?.includes("/ig/verify/") || b.title?.toLowerCase().includes("siguiendo") || b.title?.toLowerCase().includes("ya te sigo")
            );
            const finalNonFollowerButtons =
              verifyUrl && !hasVerifyBtn
                ? [{ title: "✅ Ya te sigo", url: verifyUrl }, ...baseButtons].slice(0, 3)
                : baseButtons.length > 0
                ? baseButtons
                : verifyUrl
                ? [{ title: "✅ Ya te sigo", url: verifyUrl }]
                : null;

            const nonFollowerText = rv(auto.dm_message_non_follower);
            const { success: sent } = await sendCommentDm(
              entryId, account.page_id, commentId, nonFollowerText, account.page_access_token, finalNonFollowerButtons
            );
            if (sent) {
              console.log(`[follower-gate] Non-follower message sent to ${commenterId}`);
            }
          }
        } else if (auto.dm_message_text) {
          // ── REGULAR DM (no follower gate) ───────────────────────────────
          const dmText = rv(auto.dm_message_text);
          const { success } = await sendCommentDm(entryId, account.page_id, commentId, dmText, account.page_access_token, auto.dm_buttons);
          if (success) {
            await supabase.from("instagram_comments")
              .update({ is_dm_sent: true, matched_automation_id: auto.id })
              .eq("comment_id", commentId);
          }
        }
      } catch (e) {
        console.error("Error in DM automation:", e);
      }
    }

    // Bump stats
    await supabase
      .from("instagram_comment_automations")
      .update({
        trigger_count: (auto.trigger_count ?? 0) + 1,
        last_triggered_at: new Date().toISOString(),
      })
      .eq("id", auto.id);

    // Don't fire multiple automations for the same comment
    break;
  }
}

/**
 * Process a story mention event — fired when someone mentions @yourIGaccount
 * in their own story.  Meta sends this as a "mentions" change on object=instagram.
 *
 * We run matching story_mention automations: typically an auto-DM that thanks
 * the person or sends them a resource (follower gate supported).
 */
async function processInstagramStoryMention(
  supabase: any,
  igUserId: string,   // entry.id = the IG business account that was mentioned
  change: any,
): Promise<void> {
  const value = change.value;
  if (!value) return;

  // mentionerId is the IG user ID who mentioned us (from.id in some payloads,
  // or sender_id / commenter_id depending on the exact story type).
  // Meta sends mentions with media_id of the mentioner's story.
  const mentionerId: string | null = value.sender_id || value.from?.id || null;
  const mentionerUsername: string | null = value.from?.username ?? null;
  const storyMediaId: string | null = value.media_id ?? null;

  if (!mentionerId) {
    console.warn("Story mention without mentioner id:", JSON.stringify(value).substring(0, 300));
    return;
  }

  console.log(`Story mention: @account=${igUserId} mentioned by ${mentionerId} in story ${storyMediaId}`);

  const account = await findIgAccountByIgUserId(supabase, igUserId);
  if (!account) {
    console.log(`No IG account for ig_user_id=${igUserId}; ignoring mention`);
    return;
  }

  // Don't respond to our own story mentions (loop guard)
  if (mentionerId === igUserId) return;

  // Load active story_mention automations for this account
  const { data: autos } = await supabase
    .from("instagram_comment_automations")
    .select("*")
    .eq("user_id", account.user_id)
    .eq("ig_account_id", account.id)
    .contains("trigger_types", ["story_mention"])
    .eq("is_active", true);

  if (!autos || autos.length === 0) return;

  const igToken = account.page_access_token;
  const isIgLogin = !!igToken && igToken.startsWith("IGAA");
  const igHost = isIgLogin
    ? "https://graph.instagram.com/v21.0"
    : "https://graph.facebook.com/v21.0";
  const sendFromNode = isIgLogin ? igUserId : (account.page_id || igUserId);

  const sendDm = async (text: string, buttons?: any[] | null): Promise<boolean> => {
    const r = await fetch(`${igHost}/${sendFromNode}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${igToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: mentionerId }, message: buildIgMessageBody(text, buttons) }),
    });
    const d = await r.json();
    if (d.error) { console.error("story_mention DM failed:", JSON.stringify(d.error)); return false; }
    return true;
  };

  for (const auto of autos) {
    const rv = (t: string) => resolveVars(t, mentionerUsername ?? null, null);
    const isFollower = await checkIsFollower(igUserId, mentionerId, igToken);

    if (auto.require_follower && auto.dm_message_non_follower) {
      if (isFollower === true) {
        // Confirmed follower → deliver resource
        if (auto.dm_message_text) {
          await sendDm(rv(auto.dm_message_text), auto.dm_buttons);
        }
      } else {
        // null (unverifiable) or false → send non-follower message + pending delivery
        const sent = await sendDm(rv(auto.dm_message_non_follower), auto.dm_buttons_non_follower);
        if (sent && auto.dm_message_text) {
          const { data: ex } = await supabase
            .from("instagram_pending_deliveries").select("id")
            .eq("ig_account_id", account.id).eq("commenter_id", mentionerId)
            .eq("status", "waiting_follow").maybeSingle();
          if (!ex) {
            await supabase.from("instagram_pending_deliveries").insert({
              user_id: account.user_id, ig_account_id: account.id, automation_id: auto.id,
              commenter_id: mentionerId, commenter_username: mentionerUsername,
              dm_text: rv(auto.dm_message_text),
            });
          }
        }
      }
    } else if (auto.dm_message_text) {
      await sendDm(rv(auto.dm_message_text), auto.dm_buttons);
    }

    await supabase.from("instagram_comment_automations")
      .update({ trigger_count: (auto.trigger_count ?? 0) + 1, last_triggered_at: new Date().toISOString() })
      .eq("id", auto.id);
    break;
  }
}

/**
 * New follower automation.
 * Meta sends: change.field = "follows", change.value = { follower_id: "IGSID" }
 * We look for active automations with trigger_types @> ['new_follower'] and DM the new follower.
 */
async function processInstagramNewFollower(
  supabase: SupabaseClient,
  igAccountId: string,
  change: Record<string, any>,
) {
  const followerId: string | undefined = change.value?.follower_id;
  if (!followerId) return;

  // Find the IG account record.
  // NOTE: the column is `ig_user_id` (NOT `instagram_user_id`, which does not
  // exist) — the old code queried a nonexistent column, so this lookup always
  // returned null and new_follower automations silently never fired.
  const { data: account } = await supabase
    .from("instagram_accounts")
    .select("id, user_id, organization_id, page_id, page_access_token, ig_user_id")
    .eq("ig_user_id", igAccountId)
    .maybeSingle();
  if (!account?.page_access_token) return;

  // Load active new_follower automations
  const { data: autos } = await supabase
    .from("instagram_comment_automations")
    .select("*")
    .eq("user_id", account.user_id)
    .eq("ig_account_id", account.id)
    .eq("is_active", true)
    .contains("trigger_types", ["new_follower"]);

  if (!autos || autos.length === 0) return;

  const igToken = account.page_access_token;
  const isIgLogin = !!igToken && igToken.startsWith("IGAA");
  const igHost = isIgLogin
    ? "https://graph.instagram.com/v21.0"
    : "https://graph.facebook.com/v21.0";
  // Messaging node: IG Login → ig_user_id on graph.instagram.com;
  // Page token → PAGE id on graph.facebook.com (sending from ig_user_id on
  // graph.facebook.com returns Meta error #3 "capability").
  const sendNodeId = isIgLogin ? account.ig_user_id : (account.page_id || account.ig_user_id);

  // Get follower username for {{username}} / {{nombre}} placeholders
  let followerUsername: string | null = null;
  try {
    const r = await fetch(`${igHost}/${followerId}?fields=username&access_token=${encodeURIComponent(igToken)}`);
    const d = await r.json();
    if (d.username) followerUsername = d.username;
  } catch (_) { /* ignore */ }

  for (const auto of autos) {
    if (!auto.dm_message_text) continue;
    const text = resolveVars(auto.dm_message_text, followerUsername, null);
    const r = await fetch(`${igHost}/${sendNodeId}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${igToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: followerId },
        message: buildIgMessageBody(text, auto.dm_buttons),
      }),
    });
    const d = await r.json();
    if (d.error) {
      console.error("new_follower DM failed:", JSON.stringify(d.error));
    } else {
      console.log(`New follower DM sent to ${followerId}`);
      // Save outgoing message to conversations
      await supabase.from("instagram_messages").insert({
        user_id: account.user_id,
        organization_id: account.organization_id,
        ig_account_id: account.id,
        ig_message_id: d.message_id ?? null,
        sender_id: account.ig_user_id,
        recipient_id: followerId,
        message_text: text,
        message_type: "text",
        direction: "outgoing",
        status: "sent",
        sent_at: new Date().toISOString(),
      }).catch(() => {/* non-fatal */});
    }
    await supabase.from("instagram_comment_automations")
      .update({ trigger_count: (auto.trigger_count ?? 0) + 1, last_triggered_at: new Date().toISOString() })
      .eq("id", auto.id);
    break; // fire first matching automation only
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ===== GET: Meta Webhook Verification =====
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = (url.searchParams.get("hub.verify_token") || "").trim();
    const challenge = url.searchParams.get("hub.challenge");

    // Accept any of the configured verify tokens — supports multiple Meta
    // apps subscribing to the same webhook URL (one for FB Ads/Leads, a
    // separate one for IG messaging that the old app couldn't host).
    const VERIFY_TOKENS = [
      Deno.env.get("FB_WEBHOOK_VERIFY_TOKEN"),
      Deno.env.get("IG_WEBHOOK_VERIFY_TOKEN"),
    ]
      .map((t) => (t || "").trim())
      .filter((t) => t.length > 0);

    if (mode === "subscribe" && VERIFY_TOKENS.includes(token)) {
      console.log("Webhook verified successfully");
      return new Response(challenge, { status: 200 });
    }
    console.error("Webhook verification failed", { mode, tokenProvided: !!token });
    return new Response("Forbidden", { status: 403 });
  }

  // ===== POST: Incoming webhook events =====
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();

  // ----- Signature validation -----
  // We support multiple Meta apps hitting the same webhook URL (current setup:
  // one app for FB Ads/Threads, a second app dedicated to IG messaging because
  // Meta's "use case" model makes Marketing API and IG messaging incompatible
  // in the same app).  Try every configured secret until one matches — the
  // first one that does identifies which app sent the event.
  const APP_SECRETS = [
    Deno.env.get("META_APP_SECRET"),
    Deno.env.get("META_APP_SECRET_IG"),
  ].filter((s): s is string => !!s);

  if (APP_SECRETS.length === 0) {
    console.error("No META_APP_SECRET* configured — rejecting webhook");
    return new Response("Server misconfigured", { status: 500 });
  }
  const signature = req.headers.get("x-hub-signature-256");
  let valid = false;
  for (const secret of APP_SECRETS) {
    if (await verifySignature(rawBody, signature, secret)) {
      valid = true;
      break;
    }
  }
  if (!valid) {
    console.error("Invalid webhook signature against all configured secrets", { signaturePresent: !!signature });
    return new Response("Invalid signature", { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch (e) {
    console.error("Webhook body is not valid JSON", e);
    return new Response("OK", { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // We accept three object types:
  //   "page"      → Facebook page events (leadgen, etc.)
  //   "instagram" → Instagram comments/mentions/etc.
  //   When Meta sends IG DMs via the Messenger Platform, object is also "page"
  //   but the entry has a `messaging` array (handled below).
  if (body.object !== "page" && body.object !== "instagram") {
    return new Response("OK", { status: 200 });
  }

  // Process every change in the background so we ack Meta immediately.
  // Meta retries if we don't 200 within ~20s.
  const work = (async () => {
    for (const entry of body.entry || []) {
      const entryId = entry.id;

      // ----- Page-style changes (leadgen, comments via Page) -------------------
      for (const change of entry.changes || []) {
        try {
          if (change.field === "leadgen") {
            await processLeadgenChange(supabase, entryId, change);
          } else if (change.field === "comments") {
            await processInstagramComment(supabase, entryId, change);
          } else if (change.field === "messages") {
            // IG Login flow sends DMs as a "messages" change on object=instagram
            await processInstagramDirectChange(supabase, entryId, change);
          } else if (change.field === "mentions") {
            await processInstagramStoryMention(supabase, entryId, change);
          } else if (change.field === "follows") {
            await processInstagramNewFollower(supabase, entryId, change);
          }
        } catch (err) {
          console.error(`Unhandled error processing ${change.field} change:`, err);
        }
      }

      // ----- Messenger-style messaging events (IG DMs via Page) ----------------
      for (const messagingEvent of entry.messaging || []) {
        try {
          await processInstagramMessenger(supabase, entryId, messagingEvent);
        } catch (err) {
          console.error("Unhandled error processing IG messenger event:", err);
        }
      }
    }
  })();

  // @ts-expect-error EdgeRuntime is provided by the Supabase Edge runtime
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    // @ts-expect-error see above
    EdgeRuntime.waitUntil(work);
  } else {
    // Fallback: await inline (still returns 200 even on internal error)
    await work.catch((err) => console.error("Webhook processing error:", err));
  }

  return new Response("OK", { status: 200, headers: corsHeaders });
});
