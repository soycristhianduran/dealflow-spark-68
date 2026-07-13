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

    const { phone, message, contact_id, phone_number_id: requestedPhoneId, organization_id: orgId } = await req.json();
    if (!phone || !message) throw new Error("phone and message are required");

    // Normalize phone — strip everything except digits (consistent with incoming messages)
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    if (!cleanPhone) throw new Error("Número de teléfono inválido");

    // Derivar la org del contacto si no viene, para NUNCA caer a un número de
    // otra organización en los fallbacks.
    let effectiveOrg = orgId ?? null;
    if (!effectiveOrg && contact_id) {
      const { data: c } = await supabase.from("contacts").select("organization_id").eq("id", contact_id).maybeSingle();
      effectiveOrg = c?.organization_id ?? null;
    }

    const activeCfg = () => {
      let q = supabase.from("whatsapp_configs").select("*").eq("is_active", true);
      if (effectiveOrg) q = q.eq("organization_id", effectiveOrg);
      return q;
    };

    let config: any = null;
    // 1) El número pedido, SOLO si es un número activo válido.
    if (requestedPhoneId) {
      const { data } = await activeCfg().eq("phone_number_id", requestedPhoneId).limit(1).maybeSingle();
      config = data ?? null;
    }
    // 2) Red de seguridad: el número al que el CLIENTE escribió por última vez
    //    (evita responder desde un número viejo/equivocado → error 131047).
    if (!config) {
      const { data: lastIn } = await supabase.from("whatsapp_messages")
        .select("from_phone_number_id")
        .eq("phone_number", cleanPhone).eq("direction", "incoming")
        .not("from_phone_number_id", "is", null)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (lastIn?.from_phone_number_id) {
        const { data } = await activeCfg().eq("phone_number_id", lastIn.from_phone_number_id).limit(1).maybeSingle();
        config = data ?? null;
      }
    }
    // 3) Último recurso: el número principal/activo de la org.
    if (!config) {
      const { data } = await activeCfg().order("is_primary", { ascending: false }).limit(1).maybeSingle();
      config = data ?? null;
    }

    if (!config) {
      throw new Error("WhatsApp no está configurado. El administrador debe conectar el número primero.");
    }

    // Send message via WhatsApp Cloud API
    const waApiUrl = `https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`;
    console.log("send-whatsapp: phone_number_id =", config.phone_number_id, "| to =", cleanPhone, "| url =", waApiUrl);
    const waResponse = await fetch(
      waApiUrl,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: cleanPhone,
          type: "text",
          text: { body: message },
        }),
      }
    );

    const waData = await waResponse.json();
    console.log("WhatsApp send response (status", waResponse.status, "):", JSON.stringify(waData));

    // Check error in both HTTP status and body (Meta sometimes returns 200 with error)
    if (!waResponse.ok || waData.error) {
      const errMsg = waData.error?.error_data?.details
        || waData.error?.message
        || "Error al enviar mensaje de WhatsApp";
      const errCode = waData.error?.code || waResponse.status;

      // Friendly message for 24h window expired
      if (errCode === 131047 || (errMsg && errMsg.includes("24 hour"))) {
        throw new Error(
          "La ventana de 24 horas ha expirado. El contacto debe escribirte primero, " +
          "o envía una plantilla aprobada para reanudar la conversación."
        );
      }
      throw new Error(`Meta (código ${errCode}): ${errMsg}`);
    }

    // Resolve sender's display name from auth metadata
    const senderName = user.user_metadata?.full_name
      || [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(" ")
      || user.email
      || "Agente";

    // Save message with NORMALIZED phone (same format as incoming)
    const waMessageId = waData.messages?.[0]?.id;
    await supabase.from("whatsapp_messages").insert({
      user_id: user.id,
      contact_id: contact_id || null,
      wa_message_id: waMessageId,
      phone_number: cleanPhone,              // recipient (normalized)
      from_phone_number_id: config.phone_number_id, // which of our numbers sent it
      direction: "outgoing",
      message_type: "text",
      message_text: message,
      status: "sent",
      sent_by_user_id: user.id,
      sent_by_name: senderName,
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
  } catch (error: any) {
    console.error("send-whatsapp error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
