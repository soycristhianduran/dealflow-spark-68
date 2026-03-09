import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { action } = body;

    if (action === "get_waba_accounts") {
      // Fetch WABA accounts the user has access to
      const { data: config } = await supabase
        .from("whatsapp_configs")
        .select("access_token")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!config?.access_token) throw new Error("No token found. Please reconnect.");

      const meRes = await fetch(`${GRAPH_API}/me/businesses?fields=id,name&access_token=${config.access_token}`);
      const meData = await meRes.json();

      if (meData.error) throw new Error(meData.error.message);

      const businesses = meData.data || [];
      const wabaList: any[] = [];

      for (const biz of businesses) {
        const wabaRes = await fetch(
          `${GRAPH_API}/${biz.id}/owned_whatsapp_business_accounts?fields=id,name,currency,timezone_id&access_token=${config.access_token}`
        );
        const wabaData = await wabaRes.json();
        if (wabaData.data) {
          wabaList.push(...wabaData.data.map((w: any) => ({ ...w, business_name: biz.name })));
        }
      }

      return new Response(JSON.stringify({ waba_accounts: wabaList }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_phone_numbers") {
      const { waba_id } = body;
      const { data: config } = await supabase
        .from("whatsapp_configs")
        .select("access_token")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!config?.access_token) throw new Error("No token found.");

      const res = await fetch(
        `${GRAPH_API}/${waba_id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status&access_token=${config.access_token}`
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      return new Response(JSON.stringify({ phone_numbers: data.data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "save_phone_number") {
      const { waba_id, phone_number_id, display_phone, business_name } = body;

      const { error } = await supabase
        .from("whatsapp_configs")
        .update({
          waba_id,
          phone_number_id,
          display_phone: display_phone || null,
          business_name: business_name || null,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "save_manual_config") {
      const { phone_number_id, waba_id, access_token, display_phone, business_name } = body;
      if (!phone_number_id || !waba_id || !access_token) {
        throw new Error("phone_number_id, waba_id y access_token son obligatorios");
      }

      // Validate token by making a test call
      const testRes = await fetch(`${GRAPH_API}/${phone_number_id}?fields=display_phone_number,verified_name&access_token=${access_token}`);
      const testData = await testRes.json();
      if (testData.error) {
        throw new Error("Token inválido o Phone Number ID incorrecto: " + testData.error.message);
      }

      const { error } = await supabase.from("whatsapp_configs").upsert(
        {
          user_id: user.id,
          access_token,
          phone_number_id,
          waba_id,
          display_phone: testData.display_phone_number || display_phone || null,
          business_name: testData.verified_name || business_name || null,
          is_active: true,
          webhook_verified: false,
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;

      return new Response(JSON.stringify({
        success: true,
        display_phone: testData.display_phone_number || display_phone,
        business_name: testData.verified_name || business_name,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disconnect") {
      await supabase
        .from("whatsapp_configs")
        .update({ is_active: false })
        .eq("user_id", user.id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error: any) {
    console.error("whatsapp-api error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
