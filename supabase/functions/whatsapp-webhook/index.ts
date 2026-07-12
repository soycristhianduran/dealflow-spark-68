import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── HMAC-SHA256 signature verification (same as facebook-webhook) ─────────────
async function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): Promise<boolean> {
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Splits an AI response into multiple short WhatsApp messages.
 *
 * Strategy (in order):
 *  1. If the text fits in maxLen chars → single message.
 *  2. Split on blank lines (\n\n) — Claude is instructed to use these as
 *     natural message boundaries.
 *  3. If a paragraph is still too long → split at sentence boundaries.
 *  4. Hard-cap at maxParts messages; remaining text folded into the last.
 */
function splitResponse(text: string, maxParts = 3, maxLen = 320): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxLen) return [trimmed];

  // Step 1: try paragraph splits
  const paragraphs = trimmed.split(/\n\n+/).map(p => p.trim()).filter(Boolean);

  if (paragraphs.length === 1) {
    // Single long block — split at sentence boundary nearest to the midpoint
    return splitAtSentences(trimmed, maxParts, maxLen);
  }

  // Merge paragraphs into ≤ maxParts chunks respecting maxLen
  const chunks: string[] = [];
  let cur = "";

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const candidate = cur ? cur + "\n\n" + p : p;

    if (chunks.length === maxParts - 1) {
      // Last allowed chunk — dump everything remaining into it
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
  // Sentence endings: ". ", "! ", "? " or end of string
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

const GRAPH_API = "https://graph.facebook.com/v21.0";

// Types that carry a separate media object in the payload
const MEDIA_TYPES = ["image", "audio", "voice", "video", "document", "sticker"];

function getExtFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/3gpp": "3gp",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/opus": "opus",
    "audio/webm": "webm",
    "application/pdf": "pdf",
  };
  // Handle "audio/ogg; codecs=opus" style values
  const base = mimeType.split(";")[0].trim();
  return map[base] || base.split("/")[1] || "bin";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // Webhook verification (GET)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const verifyToken = Deno.env.get("WA_WEBHOOK_VERIFY_TOKEN") || Deno.env.get("FB_WEBHOOK_VERIFY_TOKEN");

    // Also accept a stable fallback token so we can register per-WABA override
    // callback URIs (subscribed_apps override) without depending on the secret value.
    const FALLBACK_VERIFY_TOKEN = "klosify-wa-webhook-2026";

    if (mode === "subscribe" && (token === verifyToken || token === FALLBACK_VERIFY_TOKEN)) {
      console.log("WhatsApp webhook verified");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // Incoming messages (POST)
  if (req.method === "POST") {
    try {
      const rawBody = await req.text();

      // SECURITY: verify Meta HMAC-SHA256 signature to reject forged payloads.
      // Priority: META_APP_SECRET_WA (WA-specific) → META_APP_SECRET (shared app)
      // NOTE: META_APP_SECRET_IG is the Instagram secret — NEVER use it for WhatsApp.
      const appSecret = Deno.env.get("META_APP_SECRET_WA")
                     ?? Deno.env.get("META_APP_SECRET");
      if (appSecret) {
        const signature = req.headers.get("x-hub-signature-256");
        const valid = await verifyMetaSignature(rawBody, signature, appSecret);
        if (!valid) {
          console.warn("WhatsApp webhook: invalid signature — rejecting payload");
          return new Response("Forbidden", { status: 403 });
        }
      } else {
        console.warn("WhatsApp webhook: META_APP_SECRET not set — skipping signature check");
      }

      const body = JSON.parse(rawBody);
      // Log ALL webhook payloads (truncated to 2000 chars) to aid debugging
      const payloadStr = JSON.stringify(body).substring(0, 2000);
      console.log("WhatsApp webhook payload:", payloadStr);


      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const entries = body.entry || [];
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          if (change.field !== "messages") continue;
          const value = change.value;

          // Skip if nothing to process
          if (!value?.messages && !value?.statuses) continue;

          const phoneNumberId = value.metadata?.phone_number_id;
          if (!phoneNumberId) continue;

          // Find which user owns this phone_number_id.
          // We do NOT filter by is_active here — if a config exists with a real
          // phone_number_id and access_token, we process the message regardless
          // of the is_active flag. This prevents messages being silently dropped
          // due to race conditions in the connection flow.
          // We also auto-heal the is_active flag if the config is stuck.
          const { data: config } = await supabase
            .from("whatsapp_configs")
            .select("id, user_id, organization_id, access_token, is_active")
            .eq("phone_number_id", phoneNumberId)
            .neq("waba_id", "pending")
            .not("access_token", "is", null)
            .order("is_active", { ascending: false }) // prefer active configs
            .limit(1)
            .maybeSingle();

          if (!config) {
            console.log("No config found for phone_number_id:", phoneNumberId);
            continue;
          }

          // Auto-heal: if config exists but is_active=false, activate it now.
          // This silently recovers from the OAuth race condition without user intervention.
          if (!config.is_active) {
            console.log("Auto-healing is_active for phone_number_id:", phoneNumberId);
            await supabase
              .from("whatsapp_configs")
              .update({ is_active: true, updated_at: new Date().toISOString() })
              .eq("id", config.id);
          }

          // Process incoming messages
          if (value.messages) {
            for (const msg of value.messages) {
              const senderPhone = msg.from;
              const messageType = msg.type || "text";
              const waMessageId = msg.id;

              // Idempotency: Meta delivers at-least-once. If we've already
              // processed this wa_message_id, skip entirely — otherwise the
              // AI agent replies twice and the thread shows duplicates.
              if (waMessageId) {
                const { data: dupMsg } = await supabase
                  .from("whatsapp_messages")
                  .select("id")
                  .eq("wa_message_id", waMessageId)
                  .maybeSingle();
                if (dupMsg) {
                  console.log(`[wa-webhook] Duplicate delivery ${waMessageId} — skipping`);
                  continue;
                }
              }

              // Extract text — Meta delivers the body in different shapes
              // depending on what the customer did:
              //   - Plain text:           msg.text.body
              //   - Media (img/vid/etc):  msg.<type>.caption
              //   - Template button tap:  msg.button.text   (+ msg.button.payload)
              //   - Interactive reply:    msg.interactive.button_reply.title
              //                           or msg.interactive.list_reply.title
              //   - Reaction:             msg.reaction.emoji
              const mediaData = MEDIA_TYPES.includes(messageType) ? msg[messageType] : null;
              const messageText =
                msg.text?.body
                || mediaData?.caption
                || msg.button?.text           // template button click — text shown on the button
                || msg.interactive?.button_reply?.title
                || msg.interactive?.list_reply?.title
                || (msg.interactive?.nfm_reply ? "📋 Formulario completado" : "")
                || (msg.reaction?.emoji ? `Reaccionó con ${msg.reaction.emoji}` : "")
                || "";

              // WhatsApp Flow completado: las respuestas del formulario nativo
              // vienen como JSON en nfm_reply.response_json.
              let flowResponse: Record<string, unknown> | null = null;
              if (msg.interactive?.nfm_reply?.response_json) {
                try { flowResponse = JSON.parse(msg.interactive.nfm_reply.response_json); } catch (_) { /* ignore */ }
              }

              // ── Download and store media ───────────────────────────────────
              // Default: store a "meta:{id}" reference so the frontend can retry on demand
              let mediaUrl: string | null = mediaData?.id ? `meta:${mediaData.id}` : null;

              if (mediaData?.id && config.access_token) {
                try {
                  // Step 1: resolve download URL from Meta
                  const metaRes = await fetch(`${GRAPH_API}/${mediaData.id}`, {
                    headers: { "Authorization": `Bearer ${config.access_token}` },
                  });
                  const metaInfo = await metaRes.json();
                  console.log("Media meta info:", JSON.stringify(metaInfo).substring(0, 300));

                  if (metaInfo.error) {
                    console.error("Meta media lookup error:", JSON.stringify(metaInfo.error));
                    // Keep the meta: reference so frontend can retry
                  } else if (metaInfo.url) {
                    // Step 2: download the binary
                    const fileRes = await fetch(metaInfo.url, {
                      headers: { "Authorization": `Bearer ${config.access_token}` },
                    });
                    console.log("Media download status:", fileRes.status, fileRes.headers.get("content-type"));

                    if (fileRes.ok) {
                      const fileBuffer = await fileRes.arrayBuffer();
                      const mimeType = (mediaData.mime_type || metaInfo.mime_type || "application/octet-stream").split(";")[0].trim();
                      const ext = getExtFromMime(mimeType);
                      const storagePath = `${config.user_id}/${Date.now()}_${mediaData.id}.${ext}`;

                      // Step 3: upload to Supabase Storage (use Blob for compatibility)
                      const blob = new Blob([fileBuffer], { type: mimeType });
                      const { error: storageErr } = await supabase.storage
                        .from("whatsapp-media")
                        .upload(storagePath, blob, { contentType: mimeType, upsert: false });

                      if (!storageErr) {
                        const { data: publicUrlData } = supabase.storage
                          .from("whatsapp-media")
                          .getPublicUrl(storagePath);
                        mediaUrl = publicUrlData.publicUrl;  // ← real URL replaces meta: reference
                        console.log("Media stored at:", mediaUrl);
                      } else {
                        console.error("Storage upload error:", storageErr.message);
                        // Keep meta: reference so frontend can retry
                      }
                    } else {
                      console.error("Media download failed:", fileRes.status);
                    }
                  }
                } catch (mediaErr) {
                  console.error("Media processing error:", mediaErr);
                  // Keep meta: reference
                }
              }

              // ── Find-or-create the contact atomically ──────────────────────
              // Uses a DB function guarded by a per-(org,phone) advisory lock so
              // two webhook deliveries arriving at the same time cannot each
              // insert a duplicate contact (classic find-then-insert race).
              // The lookup also normalizes the phone (digits-only) so numbers
              // stored with/without "+" or spaces match the same lead.
              const waProfile = (value.contacts || []).find(
                (c: any) => c.wa_id === senderPhone || c.wa_id === `+${senderPhone}`,
              );
              const displayName: string | null = waProfile?.profile?.name || null;
              const nameParts = displayName ? displayName.trim().split(/\s+/) : [];
              const firstName = nameParts[0] || null;
              const lastName = nameParts.slice(1).join(" ") || null;
              const normalizedPhone = senderPhone.startsWith("+") ? senderPhone : `+${senderPhone}`;

              let contact: { id: string } | null = null;
              let wasCreated = false;
              if (config.organization_id) {
                const { data: foc, error: focErr } = await supabase.rpc("wa_find_or_create_contact", {
                  p_org: config.organization_id,
                  p_owner: config.user_id,
                  p_phone: senderPhone,
                  p_first: firstName,
                  p_last: lastName,
                  p_full: displayName,
                });
                if (focErr) {
                  console.error("find_or_create_contact error:", focErr.message);
                } else if (foc && foc[0]) {
                  contact = { id: foc[0].contact_id };
                  wasCreated = foc[0].was_created;
                }
              }

              // ── Post-create setup (only on the first WhatsApp message) ─────
              if (contact && wasCreated) {
                {
                  const newContact = contact;
                  console.log(`Auto-created contact ${newContact.id} from WhatsApp number ${normalizedPhone}`);

                  // Fire contact_created automation trigger (fire-and-forget)
                  fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/automation-runner`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                    },
                    body: JSON.stringify({
                      action: "trigger_event",
                      trigger_type: "contact_created",
                      contact_id: newContact.id,
                      trigger_data: { origin: "whatsapp" },
                    }),
                  }).catch(e => console.warn("contact_created automation trigger failed:", e));

                  // Relink any previous orphaned messages from this number
                  await supabase
                    .from("whatsapp_messages")
                    .update({ contact_id: newContact.id })
                    .eq("user_id", config.user_id)
                    .or(`phone_number.eq.${senderPhone},phone_number.eq.+${senderPhone}`)
                    .is("contact_id", null);

                  // Assign to first pipeline/stage so the lead appears in the pipeline view
                  const { data: waPipeline } = await supabase
                    .from("pipelines")
                    .select("id")
                    .eq("organization_id", config.organization_id)
                    .order("created_at", { ascending: true })
                    .limit(1)
                    .maybeSingle();

                  if (waPipeline) {
                    const { data: waStage } = await supabase
                      .from("pipeline_stages")
                      .select("id")
                      .eq("pipeline_id", waPipeline.id)
                      .order("order", { ascending: true })
                      .limit(1)
                      .maybeSingle();

                    if (waStage) {
                      await supabase.from("contacts")
                        .update({ pipeline_id: waPipeline.id, stage_id: waStage.id, lead_status: "active" })
                        .eq("id", newContact.id);
                      console.log(`Assigned contact ${newContact.id} → pipeline ${waPipeline.id}, stage ${waStage.id}`);
                    }
                  }
                }
              }

              // ── Atribución de clic-a-WhatsApp (CTWA) ────────────────────
              // Meta incluye `referral` cuando el chat nace de un anuncio:
              // guarda el ctwa_clid (llave para CAPI de mensajería) y, si el
              // contacto aún no tiene campaña, resuelve campaña/adset/anuncio.
              const referral = (msg as any).referral;
              if (contact && referral && (referral.ctwa_clid || referral.source_id)) {
                try {
                  const patch: Record<string, unknown> = {};
                  if (referral.ctwa_clid) patch.ctwa_clid = referral.ctwa_clid;
                  const { data: cur } = await supabase
                    .from("contacts")
                    .select("meta_ad_id, source, campaign")
                    .eq("id", contact.id)
                    .maybeSingle();
                  if (cur && !cur.meta_ad_id && referral.source_id) {
                    patch.meta_ad_id = referral.source_id;
                    if (!cur.source || cur.source === "whatsapp") patch.source = "facebook_ads";
                    patch.ad = referral.headline || null;
                    // Resolver nombres de campaña/adset con el token de Meta de la org
                    const { data: fbTok } = await supabase
                      .from("facebook_tokens")
                      .select("access_token")
                      .eq("organization_id", config.organization_id)
                      .eq("needs_reconnect", false)
                      .order("updated_at", { ascending: false })
                      .limit(1)
                      .maybeSingle();
                    if (fbTok?.access_token) {
                      const adRes = await fetch(
                        `https://graph.facebook.com/v21.0/${referral.source_id}?fields=name,campaign{id,name},adset{id,name}&access_token=${fbTok.access_token}`,
                      );
                      const adJson = await adRes.json();
                      if (adRes.ok) {
                        patch.ad = adJson.name || patch.ad;
                        if (adJson.campaign) { patch.campaign = adJson.campaign.name; patch.meta_campaign_id = adJson.campaign.id; }
                        if (adJson.adset) { patch.adset = adJson.adset.name; patch.meta_adset_id = adJson.adset.id; }
                      }
                    }
                    if (!patch.campaign && referral.source_url) patch.campaign = referral.source_url;
                  }
                  // Si el anunciante puso UTMs manuales en la URL del anuncio
                  // (estilo Kommo), capturarlos también en los campos utm_*.
                  if (referral.source_url && referral.source_url.includes("utm_")) {
                    try {
                      const u = new URL(referral.source_url);
                      for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
                        const v = u.searchParams.get(k);
                        if (v) patch[k] = v;
                      }
                    } catch (_) { /* URL inválida — ignorar */ }
                  }
                  if (Object.keys(patch).length) {
                    await supabase.from("contacts").update(patch).eq("id", contact.id);
                    console.log(`CTWA attribution saved for contact ${contact.id} (ad ${referral.source_id || "?"})`);
                  }
                } catch (e) {
                  console.warn("CTWA attribution failed (non-fatal):", e);
                }
              }

              // Save incoming message
              await supabase.from("whatsapp_messages").insert({
                user_id: config.user_id,
                contact_id: contact?.id || null,
                wa_message_id: waMessageId,
                phone_number: senderPhone,
                from_phone_number_id: phoneNumberId, // which of our numbers received it
                direction: "incoming",
                message_type: messageType,
                message_text: messageText,
                media_url: mediaUrl,
                status: "received",
                sent_at: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
              });

              // Push notification to the org's devices (fire-and-forget)
              if (config.organization_id) {
                const who = contact?.full_name || senderPhone;
                const preview = messageType === "text" ? (messageText || "") : `[${messageType}]`;
                fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "x-internal-secret": Deno.env.get("PUSH_INTERNAL_SECRET") ?? "" },
                  body: JSON.stringify({
                    organization_id: config.organization_id,
                    title: `WhatsApp · ${who}`,
                    body: preview.slice(0, 120),
                    url: `/conversations?ch=wa&id=${encodeURIComponent(senderPhone)}`,
                    tag: `wa-${senderPhone}`,
                  }),
                }).catch(() => {});
              }

              // ── Respuestas de WhatsApp Flow → campos personalizados ─────────
              if (contact?.id && flowResponse) {
                try {
                  // Claves std_<columna> → campos estándar del contacto (mapeo
                  // directo elegido al diseñar el Flow); el resto → custom_fields.
                  const STD_FLOW_COLS = new Set([
                    "first_name", "last_name", "full_name", "primary_email", "primary_phone",
                    "city", "country", "notes", "company_name", "budget",
                  ]);
                  const { data: curC } = await supabase.from("contacts").select("custom_fields").eq("id", contact.id).maybeSingle();
                  const merged: Record<string, unknown> = { ...(curC?.custom_fields ?? {}) };
                  const colPatch: Record<string, unknown> = {};
                  for (const [k, v] of Object.entries(flowResponse)) {
                    if (k === "flow_token") continue;
                    const val = typeof v === "string" ? v : JSON.stringify(v);
                    if (k.startsWith("std_") && STD_FLOW_COLS.has(k.slice(4))) {
                      const col = k.slice(4);
                      if (col === "budget") {
                        const n = parseFloat(String(val).replace(/[^0-9.,]/g, "").replace(",", "."));
                        if (isFinite(n) && n > 0) colPatch.budget = n;
                      } else {
                        colPatch[col] = val;
                      }
                    } else {
                      merged[k] = val;
                    }
                  }
                  await supabase.from("contacts").update({ custom_fields: merged, ...colPatch }).eq("id", contact.id);
                  console.log(`Flow response saved to contact ${contact.id}:`, Object.keys(flowResponse).join(","));
                } catch (e) { console.warn("Flow response save failed:", e); }
              }

              // ── Bot de flujo esperando respuesta: reanudarlo con este mensaje.
              // Síncrono a propósito: si un bot consume la respuesta, el agente
              // de IA no debe responder también (botHandledReply).
              let botHandledReply = false;
              if (contact?.id) {
                try {
                  const resumeRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/automation-runner`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                    },
                    body: JSON.stringify({
                      action: "incoming_reply",
                      contact_id: contact.id,
                      reply_text: flowResponse ? JSON.stringify(flowResponse) : messageText,
                    }),
                  });
                  const resumeJson = await resumeRes.json().catch(() => null);
                  if (resumeJson?.resumed > 0) botHandledReply = true;
                } catch (e) {
                  console.warn("incoming_reply resume failed (non-fatal):", e);
                }
              }

              // Fire whatsapp_incoming automation trigger (fire-and-forget)
              if (contact?.id) {
                fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/automation-runner`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                  },
                  body: JSON.stringify({
                    action: "trigger_event",
                    trigger_type: "whatsapp_incoming",
                    contact_id: contact.id,
                    trigger_data: { message_text: messageText, message_type: messageType, phone: senderPhone },
                  }),
                }).catch(e => console.warn("whatsapp_incoming automation trigger failed:", e));
              }

              // Fire whatsapp.message_received webhook (fire-and-forget)
              if (config.organization_id) {
                fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/webhook-dispatcher`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    event: "whatsapp.message_received",
                    organization_id: config.organization_id,
                    data: {
                      phone: senderPhone,
                      message_type: messageType,
                      message_text: messageText,
                      media_url: mediaUrl ?? null,
                      contact_id: contact?.id ?? null,
                      contact_name: contact?.full_name ?? null,
                      wa_message_id: waMessageId,
                      received_at: new Date().toISOString(),
                    },
                  }),
                }).catch(e => console.warn("whatsapp.message_received webhook failed:", e));
              }

              // Log activity if contact found
              if (contact?.id) {
                const activitySummary = mediaUrl
                  ? `Mensaje de WhatsApp recibido: [${messageType}]${messageText ? ` — "${messageText.substring(0, 80)}"` : ""}`
                  : `Mensaje de WhatsApp recibido: "${messageText.substring(0, 100)}"`;

                await supabase.from("activities").insert({
                  related_entity_type: "contact",
                  related_entity_id: contact.id,
                  event_type: "whatsapp",
                  event_source: "whatsapp_webhook",
                  summary: activitySummary,
                  created_by: config.user_id,
                });

                // Update last_contact_at
                await supabase
                  .from("contacts")
                  .update({ last_contact_at: new Date().toISOString() })
                  .eq("id", contact.id);

                // Trigger AI score analysis in background (fire-and-forget)
                const analysisPromise = fetch(
                  `${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-contact-ai`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                    },
                    body: JSON.stringify({
                      contact_id: contact.id,
                      user_id: config.user_id,
                      auto_trigger: true,
                    }),
                  }
                ).catch(e => console.warn("Auto AI analysis failed:", e));
                // @ts-ignore — EdgeRuntime is Deno Deploy specific
                if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(analysisPromise);

                // ── AI Agent: respond automatically (inline, awaited before the
                // 200 — reliable because the agent call is fast, ~3-5s, well under
                // Meta's ~20s window; the ai-agent fetch is retried once to absorb
                // transient inter-function hiccups that silently dropped replies). ──
                console.log("[AI-AGENT] Starting agent block. org_id:", config.organization_id, "contact_id:", contact?.id);
                await supabase.from("ai_agent_debug").insert({ organization_id: config.organization_id, phone: senderPhone, step: "block_reached", detail: `msgType=${messageType}` }).then(() => {}, () => {});
                try {
                  // Mientras un bot de flujo tenga la conversación (consumió esta
                  // respuesta o sigue esperando una), el agente de IA no responde.
                  let botOwnsConversation = botHandledReply;
                  if (!botOwnsConversation && contact?.id) {
                    const { data: stillWaiting } = await supabase
                      .from("automation_enrollments")
                      .select("id")
                      .eq("contact_id", contact.id)
                      .eq("status", "waiting_reply")
                      .limit(1)
                      .maybeSingle();
                    botOwnsConversation = !!stillWaiting;
                  }
                  if (botOwnsConversation) {
                    await supabase.from("ai_agent_debug").insert({ organization_id: config.organization_id, phone: senderPhone, step: "skipped_bot_active", detail: "flujo con esperar-respuesta activo" }).then(() => {}, () => {});
                  } else
                  if (config.organization_id) {
                    console.log("[AI-AGENT] Organization check passed, fetching history...");
                    // Fetch last 16 messages for context (17 rows, skip index 0
                    // which is the current message just inserted, so history
                    // contains only PREVIOUS messages — avoids duplicate context).
                    const { data: recentMsgs } = await supabase
                      .from("whatsapp_messages")
                      .select("direction, message_text, message_type")
                      .eq("user_id", config.user_id)
                      .or(`phone_number.eq.${senderPhone},phone_number.eq.+${senderPhone}`)
                      .order("sent_at", { ascending: false })
                      .limit(17);

                    // [0] is current message (just inserted) — skip it so Claude
                    // doesn't see it twice (it arrives again as the `message` field).
                    const history = (recentMsgs || [])
                      .slice(1)           // drop current
                      .reverse()          // oldest → newest
                      .map((m: any) => ({
                        role: m.direction === "incoming" ? "user" : "assistant",
                        content: m.message_text || `[${m.message_type}]`,
                      }));

                    console.log("[AI-AGENT] Calling ai-agent function, history length:", history.length);
                    // Retry the inter-function call up to 2 times — a transient
                    // gateway/network hiccup here used to silently drop the reply.
                    let agentData: any = null;
                    let lastStatus = 0;
                    // Retry up to 3 times — on network error AND on a non-2xx
                    // status (Supabase's inter-function gateway intermittently
                    // returns 5xx, which silently dropped replies). Only stop when
                    // we get a usable payload (a response or an explicit reason).
                    for (let attempt = 1; attempt <= 3; attempt++) {
                      try {
                        const agentRes = await fetch(
                          `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-agent`,
                          {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""}`,
                              "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
                            },
                            body: JSON.stringify({
                              channel: "whatsapp",
                              organization_id: config.organization_id,
                              user_id: config.user_id,
                              contact_id: contact.id,
                              session_key: senderPhone.startsWith("+") ? senderPhone : `+${senderPhone}`,
                              message: { type: messageType, content: messageText, media_url: mediaUrl },
                              recent_messages: history,
                            }),
                          }
                        );
                        lastStatus = agentRes.status;
                        if (agentRes.ok) {
                          agentData = await agentRes.json().catch(() => null);
                          // Usable payload = any text reply, an explicit reason
                          // (paused/quota/inactive), or media to send. Treat all
                          // three as "done" so a media-only reply isn't retried.
                          if (agentData?.response || agentData?.reason || (Array.isArray(agentData?.media) && agentData.media.length)) break;
                        } else {
                          console.error(`[AI-AGENT] ai-agent non-ok status ${agentRes.status} (attempt ${attempt})`);
                        }
                      } catch (fetchErr: any) {
                        console.error(`[AI-AGENT] ai-agent fetch attempt ${attempt} failed:`, fetchErr?.message);
                      }
                      if (attempt < 3) await sleep(1000);
                    }

                    // Detailed logging so we can diagnose agent failures in production
                    if (!agentData?.response) {
                      const reason = agentData?.reason || agentData?.error || "unknown";
                      console.log(`[AI-AGENT] No response. reason=${reason} org=${config.organization_id}`);
                      await supabase.from("ai_agent_debug").insert({ organization_id: config.organization_id, phone: senderPhone, step: "no_response", detail: `reason=${reason} httpStatus=${lastStatus} agentDataNull=${agentData === null}` }).then(() => {}, () => {});
                    } else {
                      console.log("[AI-AGENT] Responding. length:", agentData.response.length, "escalated:", agentData.escalated);
                      await supabase.from("ai_agent_debug").insert({ organization_id: config.organization_id, phone: senderPhone, step: "got_response", detail: `len=${agentData.response.length}` }).then(() => {}, () => {});
                    }

                    if (agentData?.response) {
                      // Split long responses into multiple short messages
                      const parts = splitResponse(agentData.response);

                      for (let i = 0; i < parts.length; i++) {
                        const part = parts[i];

                        // Small pause between messages so it feels natural (skip on first)
                        if (i > 0) await sleep(700);

                        // Send directly via Meta Graph API (no send-whatsapp function
                        // needed — we already have the access_token from whatsapp_configs).
                        const metaRes = await fetch(
                          `${GRAPH_API}/${phoneNumberId}/messages`,
                          {
                            method: "POST",
                            headers: {
                              "Authorization": `Bearer ${config.access_token}`,
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              messaging_product: "whatsapp",
                              to: senderPhone,
                              type: "text",
                              text: { body: part },
                            }),
                          }
                        );
                        const metaData = await metaRes.json();
                        const metaError = metaData.error
                          ? `Meta error ${metaData.error.code}: ${metaData.error.message}${metaData.error.error_data?.details ? " — " + metaData.error.error_data.details : ""}`
                          : null;
                        if (metaError) {
                          console.error("[AI-AGENT] Meta send error:", metaError);
                        }
                        const waOutId = metaData?.messages?.[0]?.id || null;

                        // Save this part to DB — include error_details so failures are visible
                        await supabase.from("whatsapp_messages").insert({
                          user_id: config.user_id,
                          contact_id: contact.id,
                          wa_message_id: waOutId,
                          phone_number: senderPhone,
                          from_phone_number_id: phoneNumberId,
                          direction: "outgoing",
                          message_type: "text",
                          message_text: part,
                          status: metaError ? "failed" : "sent",
                          error_details: metaError,
                          sent_at: new Date().toISOString(),
                          is_ai_generated: true,
                        });
                      }

                      // Send any media the agent chose (images / PDFs)
                      if (Array.isArray(agentData.media) && agentData.media.length) {
                        for (const media of agentData.media) {
                          await sleep(700);
                          const isDoc = media.type === "document";
                          const payload: any = {
                            messaging_product: "whatsapp",
                            to: senderPhone,
                            type: isDoc ? "document" : "image",
                          };
                          payload[isDoc ? "document" : "image"] = isDoc
                            ? { link: media.link, filename: media.filename || "archivo.pdf" }
                            : { link: media.link };
                          const mRes = await fetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
                            method: "POST",
                            headers: { "Authorization": `Bearer ${config.access_token}`, "Content-Type": "application/json" },
                            body: JSON.stringify(payload),
                          });
                          const mData = await mRes.json();
                          const mErr = mData.error ? `Meta error ${mData.error.code}: ${mData.error.message}` : null;
                          if (mErr) console.error("[AI-AGENT] Media send error:", mErr);
                          await supabase.from("whatsapp_messages").insert({
                            user_id: config.user_id,
                            contact_id: contact.id,
                            wa_message_id: mData?.messages?.[0]?.id || null,
                            phone_number: senderPhone,
                            from_phone_number_id: phoneNumberId,
                            direction: "outgoing",
                            message_type: isDoc ? "document" : "image",
                            message_text: media.filename || media.link,
                            media_url: media.link,
                            status: mErr ? "failed" : "sent",
                            error_details: mErr,
                            sent_at: new Date().toISOString(),
                            is_ai_generated: true,
                          });
                        }
                      }

                      // If escalated: log activity to notify the vendor
                      if (agentData.escalated) {
                        await supabase.from("activities").insert({
                          related_entity_type: "contact",
                          related_entity_id: contact.id,
                          event_type: "note",
                          event_source: "ai_agent",
                          summary: `🤖 El agente IA escaló esta conversación — el lead quiere hablar con un asesor. Por favor retoma la conversación en WhatsApp.`,
                          created_by: config.user_id,
                        });
                      }
                    }
                  }
                } catch (e: any) {
                  console.error("[AI-AGENT] CAUGHT ERROR:", e?.message, e?.stack);
                }
              }
            }
          }

          // Process delivery status updates (sent → delivered → read, or failed)
          // These arrive as separate webhook events, not bundled with messages
          if (value.statuses) {
            for (const status of value.statuses) {
              const errStr = status.errors?.length > 0 ? JSON.stringify(status.errors) : null;
              console.log("Status update:", status.id, "→", status.status, errStr ?? "ok");

              // Always update status first (never conditional — avoids silent failures
              // when error_details column was missing previously)
              const updatePayload: Record<string, string | null> = {
                status: status.status,
              };
              if (errStr) updatePayload.error_details = errStr;

              const { error: updateErr } = await supabase
                .from("whatsapp_messages")
                .update(updatePayload)
                .eq("wa_message_id", status.id);

              if (updateErr) {
                console.error("Failed to update message status:", status.id, updateErr.message);
              }

              // ── Also reflect the status on the campaign send record + metrics ──
              // (Previously only whatsapp_messages was updated, so campaign
              // delivered/read counts stayed at 0 — the stats were wrong.)
              try {
                const RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
                const { data: sendRow } = await supabase
                  .from("whatsapp_sends")
                  .select("id, campaign_id, status")
                  .eq("wa_message_id", status.id)
                  .maybeSingle();
                if (sendRow) {
                  const ts = status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString();
                  const cur = RANK[sendRow.status] ?? 0;
                  const next = RANK[status.status] ?? 0;
                  const patch: Record<string, any> = {};
                  // Don't downgrade (out-of-order webhooks); 'failed' always wins.
                  if (status.status === "failed") { patch.status = "failed"; if (errStr) patch.error_message = errStr; }
                  else if (next > cur) patch.status = status.status;
                  if (status.status === "delivered") patch.delivered_at = ts;
                  if (status.status === "read") { patch.read_at = ts; patch.delivered_at = patch.delivered_at ?? ts; }
                  if (Object.keys(patch).length) {
                    await supabase.from("whatsapp_sends").update(patch).eq("id", sendRow.id);
                  }
                  // Recompute campaign counters from the source of truth.
                  if (sendRow.campaign_id) {
                    const { data: rows } = await supabase.from("whatsapp_sends").select("status").eq("campaign_id", sendRow.campaign_id);
                    const all = rows || [];
                    const delivered = all.filter((r: any) => r.status === "delivered" || r.status === "read").length;
                    const read = all.filter((r: any) => r.status === "read").length;
                    const failed = all.filter((r: any) => r.status === "failed").length;
                    await supabase.from("whatsapp_campaigns")
                      .update({ delivered_count: delivered, read_count: read, failed_count: failed })
                      .eq("id", sendRow.campaign_id);
                  }
                }
              } catch (e) {
                console.error("campaign metric update failed:", e);
              }
            }
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("WhatsApp webhook error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
