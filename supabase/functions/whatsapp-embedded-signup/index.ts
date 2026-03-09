import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const META_APP_ID = Deno.env.get("META_APP_ID")!;
    const META_APP_SECRET = Deno.env.get("META_APP_SECRET")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authenticate user
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { code } = body;

    if (!code) throw new Error("Missing code from Embedded Signup");

    // 1. Exchange code for short-lived token
    const tokenRes = await fetch(
      `${GRAPH_API}/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&code=${code}`
    );
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("Token exchange failed:", tokenData);
      throw new Error("Token exchange failed");
    }

    // 2. Exchange for long-lived token
    const longTokenRes = await fetch(
      `${GRAPH_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
    );
    const longTokenData = await longTokenRes.json();
    const longLivedToken = longTokenData.access_token || tokenData.access_token;

    // 3. Get shared WABA(s) - find the WABA and phone number the user just connected
    // First get the user's businesses
    const bizRes = await fetch(`${GRAPH_API}/me/businesses?fields=id,name&access_token=${longLivedToken}`);
    const bizData = await bizRes.json();

    let selectedWabaId = "";
    let selectedWabaName = "";
    let selectedPhoneId = "";
    let selectedDisplayPhone = "";
    let selectedBusinessName = "";

    const businesses = bizData.data || [];
    
    for (const biz of businesses) {
      // Get WABAs for this business
      const wabaRes = await fetch(
        `${GRAPH_API}/${biz.id}/owned_whatsapp_business_accounts?fields=id,name&access_token=${longLivedToken}`
      );
      const wabaData = await wabaRes.json();

      if (wabaData.data && wabaData.data.length > 0) {
        for (const waba of wabaData.data) {
          // Get phone numbers for this WABA
          const phoneRes = await fetch(
            `${GRAPH_API}/${waba.id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status&access_token=${longLivedToken}`
          );
          const phoneData = await phoneRes.json();

          if (phoneData.data && phoneData.data.length > 0) {
            // Take the first available phone number
            const phone = phoneData.data[0];
            selectedWabaId = waba.id;
            selectedWabaName = waba.name;
            selectedPhoneId = phone.id;
            selectedDisplayPhone = phone.display_phone_number;
            selectedBusinessName = phone.verified_name || waba.name || biz.name;
            break;
          }
        }
        if (selectedPhoneId) break;
      }
    }

    if (!selectedPhoneId || !selectedWabaId) {
      // Save token as pending so user can manually select later
      await supabase.from("whatsapp_configs").upsert(
        {
          user_id: user.id,
          access_token: longLivedToken,
          phone_number_id: "pending",
          waba_id: "pending",
          is_active: false,
          webhook_verified: false,
        },
        { onConflict: "user_id" }
      );

      return new Response(JSON.stringify({ 
        success: true, 
        status: "pending",
        message: "Token saved. Please select your WABA and phone number." 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Save complete config
    await supabase.from("whatsapp_configs").upsert(
      {
        user_id: user.id,
        access_token: longLivedToken,
        phone_number_id: selectedPhoneId,
        waba_id: selectedWabaId,
        display_phone: selectedDisplayPhone,
        business_name: selectedBusinessName,
        is_active: true,
        webhook_verified: false,
      },
      { onConflict: "user_id" }
    );

    return new Response(JSON.stringify({ 
      success: true, 
      status: "connected",
      waba_id: selectedWabaId,
      waba_name: selectedWabaName,
      phone_number_id: selectedPhoneId,
      display_phone: selectedDisplayPhone,
      business_name: selectedBusinessName,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("WhatsApp Embedded Signup error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
