import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      const body = await req.json();
      console.log("WhatsApp webhook payload:", JSON.stringify(body));

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const entries = body.entry || [];
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          if (change.field !== "messages") continue;
          const value = change.value;
          if (!value?.messages) continue;

          const phoneNumberId = value.metadata?.phone_number_id;
          if (!phoneNumberId) continue;

          // Find which user owns this phone_number_id
          const { data: config } = await supabase
            .from("whatsapp_configs")
            .select("user_id")
            .eq("phone_number_id", phoneNumberId)
            .eq("is_active", true)
            .single();

          if (!config) {
            console.log("No config found for phone_number_id:", phoneNumberId);
            continue;
          }

          for (const msg of value.messages) {
            const senderPhone = msg.from;
            const messageText = msg.text?.body || msg.caption || "";
            const messageType = msg.type || "text";
            const waMessageId = msg.id;

            // Try to find contact by phone
            const { data: contact } = await supabase
              .from("contacts")
              .select("id")
              .eq("owner_id", config.user_id)
              .or(`primary_phone.eq.${senderPhone},primary_phone.eq.+${senderPhone}`)
              .maybeSingle();

            // Save incoming message
            await supabase.from("whatsapp_messages").insert({
              user_id: config.user_id,
              contact_id: contact?.id || null,
              wa_message_id: waMessageId,
              phone_number: senderPhone,
              direction: "incoming",
              message_type: messageType,
              message_text: messageText,
              status: "received",
              sent_at: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
            });

            // Log activity if contact found
            if (contact?.id) {
              await supabase.from("activities").insert({
                related_entity_type: "contact",
                related_entity_id: contact.id,
                event_type: "whatsapp",
                event_source: "whatsapp_webhook",
                summary: `Mensaje de WhatsApp recibido: "${messageText.substring(0, 100)}"`,
                created_by: config.user_id,
              });

              // Update last_contact_at
              await supabase
                .from("contacts")
                .update({ last_contact_at: new Date().toISOString() })
                .eq("id", contact.id);
            }
          }

          // Process status updates
          if (value.statuses) {
            for (const status of value.statuses) {
              await supabase
                .from("whatsapp_messages")
                .update({ status: status.status })
                .eq("wa_message_id", status.id);
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
