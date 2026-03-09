import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("No authorization header");
    
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const { phone, message, contact_id } = await req.json();
    if (!phone || !message) throw new Error("phone and message are required");

    // Get user's WhatsApp config
    const { data: config, error: configError } = await supabase
      .from("whatsapp_configs")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (configError || !config) {
      throw new Error("WhatsApp no está configurado. Configura tus credenciales primero.");
    }

    // Send message via WhatsApp Cloud API
    const waResponse = await fetch(
      `https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone.replace(/[^0-9]/g, ""),
          type: "text",
          text: { body: message },
        }),
      }
    );

    const waData = await waResponse.json();

    if (!waResponse.ok) {
      console.error("WhatsApp API error:", waData);
      throw new Error(waData.error?.message || "Error al enviar mensaje de WhatsApp");
    }

    // Save message to DB
    const waMessageId = waData.messages?.[0]?.id;
    await supabase.from("whatsapp_messages").insert({
      user_id: user.id,
      contact_id: contact_id || null,
      wa_message_id: waMessageId,
      phone_number: phone,
      direction: "outgoing",
      message_type: "text",
      message_text: message,
      status: "sent",
    });

    // Log activity if contact
    if (contact_id) {
      await supabase.from("activities").insert({
        related_entity_type: "contact",
        related_entity_id: contact_id,
        event_type: "whatsapp",
        event_source: "whatsapp_cloud_api",
        summary: `Mensaje de WhatsApp enviado: "${message.substring(0, 100)}"`,
        created_by: user.id,
      });
    }

    return new Response(JSON.stringify({ success: true, message_id: waMessageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-whatsapp error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
