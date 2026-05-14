import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";
const IG_GRAPH_API = "https://graph.instagram.com/v21.0";

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
    const leadRes = await fetch(`${GRAPH_API}/${leadgenId}?access_token=${pageToken}`);
    const leadData = await leadRes.json();
    if (!leadRes.ok) {
      console.error(`Graph API error fetching lead ${leadgenId}:`, JSON.stringify(leadData));
      return;
    }
    for (const fd of leadData.field_data || []) {
      fields[(fd.name || "").toLowerCase()] = (fd.values || [])[0] || "";
    }
  }

  const { data: userMappings } = await supabase
    .from("facebook_field_mappings")
    .select("fb_field_name, contact_field, is_custom_field")
    .eq("user_id", userId)
    .eq("form_id", formId);

  const hasCustomMappings = userMappings && userMappings.length > 0;

  const contactData: Record<string, any> = {
    source: "facebook_ads",
    campaign: change.value?.campaign_name || change.value?.campaign_id || formId,
    adset: change.value?.adset_name || change.value?.adset_id || null,
    ad: change.value?.ad_name || change.value?.ad_id || null,
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

  let existingContactId: string | null = null;
  if (contactData.primary_email) {
    const { data } = await supabase
      .from("contacts")
      .select("id")
      .eq("primary_email", contactData.primary_email)
      .limit(1)
      .maybeSingle();
    existingContactId = data?.id || null;
  }
  if (!existingContactId && contactData.primary_phone) {
    const { data } = await supabase
      .from("contacts")
      .select("id")
      .eq("primary_phone", contactData.primary_phone)
      .limit(1)
      .maybeSingle();
    existingContactId = data?.id || null;
  }

  if (existingContactId) {
    console.log(`Lead ${leadgenId} already exists as contact ${existingContactId}, skipping`);
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

  const { data: pipeline } = await supabase
    .from("pipelines")
    .select("id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

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

  const { error: dealErr } = await supabase.from("deals").insert({
    title: `Lead FB - ${contactData.full_name}`,
    contact_id: newContact.id,
    pipeline_id: pipeline.id,
    stage_id: stage.id,
    owner_id: userId,
    organization_id: organizationId,
    value: 0,
    currency: "USD",
    status: "open",
    source: "facebook",
  });
  if (dealErr) {
    console.error(`Error creating deal for contact ${newContact.id}:`, dealErr);
  } else {
    console.log(`Created deal for contact ${newContact.id}`);
  }

  // ── Trigger automations with trigger_type = "meta_lead_form" ────────────────
  try {
    const { data: automations } = await supabase
      .from("automations")
      .select("id, trigger_config")
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("trigger_type", "meta_lead_form");

    const matching = (automations || []).filter((a: any) => {
      const cfg = a.trigger_config || {};
      // Fire if no form_id configured (catch-all) OR form_id matches
      return !cfg.form_id || cfg.form_id === formId;
    });

    if (matching.length > 0) {
      const enrollments = matching.map((a: any) => ({
        automation_id: a.id,
        contact_id: newContact.id,
        user_id: userId,
        status: "active",
        current_step_index: 0,
        next_run_at: new Date().toISOString(),
      }));
      const { data: inserted, error: enrollErr } = await supabase
        .from("automation_enrollments")
        .insert(enrollments)
        .select("*, automations(*), contacts(*)");
      if (enrollErr) {
        console.error("Error enrolling contact in automations:", enrollErr);
      } else {
        console.log(`Enrolled contact ${newContact.id} in ${matching.length} automation(s)`);
        // Fire first step immediately — the automation runner cron is the fallback,
        // but we want instant execution when a lead arrives.
        const runnerUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/automation-runner`;
        fetch(runnerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({}),
        }).catch((e) => console.error("Could not trigger automation-runner:", e));
      }
    }
  } catch (autoErr) {
    // Non-fatal — log and continue
    console.error("Error triggering automations for lead:", autoErr);
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
): Promise<{ id: string; user_id: string; page_access_token: string } | null> {
  const { data } = await supabase
    .from("instagram_accounts")
    .select("id, user_id, page_access_token")
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

  const conversationId = await upsertIgConversation(supabase, {
    user_id: account.user_id,
    ig_account_id: account.id,
    participant_id: senderId,
    last_message_at: timestamp,
    last_message_preview: messageText.substring(0, 200) || `[${messageType}]`,
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
    message_type: messageType,
    message_text: messageText || null,
    attachment_url: attachmentUrl,
    sender_id: senderId,
    recipient_id: recipientId,
    status: "received",
    received_at: timestamp,
    sent_at: timestamp,
  });

  console.log(`IG DM stored: from=${senderId} to=${recipientId} text=${messageText.substring(0, 60)}`);
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

/**
 * Process a comment event.  Stores the comment + runs any matching
 * comment-to-DM automations.
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
  const commenterId = value.from?.id;
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

  // Persist the comment
  await supabase
    .from("instagram_comments")
    .upsert(
      {
        user_id: account.user_id,
        ig_account_id: account.id,
        comment_id: commentId,
        parent_comment_id: parentCommentId,
        media_id: mediaId,
        commenter_id: commenterId,
        commenter_username: commenterUsername,
        text,
      },
      { onConflict: "comment_id" },
    );

  // ----- Run matching automations ------------------------------------------
  const { data: automations } = await supabase
    .from("instagram_comment_automations")
    .select("*")
    .eq("user_id", account.user_id)
    .eq("ig_account_id", account.id)
    .eq("is_active", true);

  if (!automations || automations.length === 0) return;

  const lowerText = text.toLowerCase();

  for (const auto of automations) {
    // Filter by media_id if set
    if (auto.media_id && auto.media_id !== mediaId) continue;

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

    // Substitute {{username}} placeholder
    const usernameForTemplate = commenterUsername ? `@${commenterUsername}` : "";

    // 1) Public reply on the comment
    if (auto.reply_to_comment_text) {
      try {
        const replyText = auto.reply_to_comment_text.replace(/\{\{username\}\}/g, usernameForTemplate);
        const res = await fetch(`https://graph.facebook.com/v21.0/${commentId}/replies`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${account.page_access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: replyText }),
        });
        const data = await res.json();
        if (data.error) {
          console.error("Automation reply_comment failed:", JSON.stringify(data.error));
        } else {
          await supabase
            .from("instagram_comments")
            .update({ is_replied: true, matched_automation_id: auto.id })
            .eq("comment_id", commentId);
        }
      } catch (e) {
        console.error("Error replying to comment in automation:", e);
      }
    }

    // 2) Send DM to the commenter
    if (auto.dm_message_text) {
      try {
        const dmText = auto.dm_message_text.replace(/\{\{username\}\}/g, usernameForTemplate);

        // For comment-to-DM we send via the "Private Replies" endpoint which
        // uses the comment_id as the target, not a user PSID.  This is a special
        // affordance Meta gives for replying privately to public comments.
        const res = await fetch(`https://graph.facebook.com/v21.0/${entryId}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${account.page_access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            recipient: { comment_id: commentId },
            message: { text: dmText },
          }),
        });
        const data = await res.json();
        if (data.error) {
          console.error("Automation DM failed:", JSON.stringify(data.error));
        } else {
          await supabase
            .from("instagram_comments")
            .update({ is_dm_sent: true, matched_automation_id: auto.id })
            .eq("comment_id", commentId);
        }
      } catch (e) {
        console.error("Error sending DM in automation:", e);
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
            console.log("Instagram mention received:", JSON.stringify(change.value));
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
