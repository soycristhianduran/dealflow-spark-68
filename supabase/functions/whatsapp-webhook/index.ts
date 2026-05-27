import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    if (mode === "subscribe" && token === verifyToken) {
      console.log("WhatsApp webhook verified");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // Incoming messages (POST)
  if (req.method === "POST") {
    try {
      const rawBody = await req.text();
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

          // Find which user owns this phone_number_id (also fetch access_token for media download)
          const { data: config } = await supabase
            .from("whatsapp_configs")
            .select("user_id, organization_id, access_token")
            .eq("phone_number_id", phoneNumberId)
            .eq("is_active", true)
            .single();

          if (!config) {
            console.log("No config found for phone_number_id:", phoneNumberId);
            continue;
          }

          // Process incoming messages
          if (value.messages) {
            for (const msg of value.messages) {
              const senderPhone = msg.from;
              const messageType = msg.type || "text";
              const waMessageId = msg.id;

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
                || (msg.reaction?.emoji ? `Reaccionó con ${msg.reaction.emoji}` : "")
                || "";

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

              // Try to find contact by phone
              let { data: contact } = await supabase
                .from("contacts")
                .select("id")
                .eq("owner_id", config.user_id)
                .or(`primary_phone.eq.${senderPhone},primary_phone.eq.+${senderPhone}`)
                .maybeSingle();

              // ── Auto-create lead from first WhatsApp message ───────────────
              // If no contact exists yet, create one so the lead isn't lost.
              // Meta sometimes sends the WhatsApp display name in value.contacts[].profile.name
              if (!contact && config.organization_id) {
                const waProfile = (value.contacts || []).find(
                  (c: any) => c.wa_id === senderPhone || c.wa_id === `+${senderPhone}`,
                );
                const displayName: string | null = waProfile?.profile?.name || null;
                const nameParts = displayName ? displayName.trim().split(/\s+/) : [];
                const firstName = nameParts[0] || null;
                const lastName = nameParts.slice(1).join(" ") || null;
                // Normalize: always store with leading "+"
                const normalizedPhone = senderPhone.startsWith("+") ? senderPhone : `+${senderPhone}`;

                const { data: newContact, error: createErr } = await supabase
                  .from("contacts")
                  .insert({
                    owner_id: config.user_id,
                    organization_id: config.organization_id,
                    primary_phone: normalizedPhone,
                    first_name: firstName,
                    last_name: lastName,
                    full_name: displayName || normalizedPhone,
                    source: "whatsapp",
                  })
                  .select("id")
                  .single();

                if (createErr) {
                  console.error("Auto-create contact error:", createErr.message);
                } else if (newContact) {
                  console.log(`Auto-created contact ${newContact.id} from WhatsApp number ${normalizedPhone}`);
                  contact = newContact;

                  // Relink any previous orphaned messages from this number
                  await supabase
                    .from("whatsapp_messages")
                    .update({ contact_id: newContact.id })
                    .eq("user_id", config.user_id)
                    .or(`phone_number.eq.${senderPhone},phone_number.eq.+${senderPhone}`)
                    .is("contact_id", null);
                }
              }

              // Save incoming message
              await supabase.from("whatsapp_messages").insert({
                user_id: config.user_id,
                contact_id: contact?.id || null,
                wa_message_id: waMessageId,
                phone_number: senderPhone,
                direction: "incoming",
                message_type: messageType,
                message_text: messageText,
                media_url: mediaUrl,
                status: "received",
                sent_at: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
              });

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
