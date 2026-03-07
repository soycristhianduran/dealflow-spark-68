import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

async function getUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("No auth header");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !user) throw new Error("Invalid user");
  return { user, supabase };
}

async function getFbToken(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("facebook_tokens")
    .select("access_token")
    .eq("user_id", userId)
    .single();
  if (error || !data) throw new Error("Facebook not connected");
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { user, supabase } = await getUser(req);
    const body = await req.json();
    const { action } = body;

    const fbToken = await getFbToken(supabase, user.id);

    switch (action) {
      // ===== GET PAGES =====
      case "get_pages": {
        const res = await fetch(`${GRAPH_API}/me/accounts?fields=id,name,access_token,category&access_token=${fbToken}`);
        const data = await res.json();
        if (!res.ok) throw new Error(`Facebook API error: ${JSON.stringify(data)}`);
        return new Response(JSON.stringify({ pages: data.data || [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ===== SAVE SELECTED PAGES =====
      case "save_pages": {
        const { pages } = body; // [{page_id, page_name, page_access_token}]
        for (const page of pages) {
          await supabase.from("facebook_pages").upsert(
            { user_id: user.id, page_id: page.page_id, page_name: page.page_name, page_access_token: page.page_access_token },
            { onConflict: "user_id,page_id" }
          );
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ===== GET LEAD FORMS FOR A PAGE =====
      case "get_lead_forms": {
        const { page_id } = body;
        const { data: pageData } = await supabase
          .from("facebook_pages")
          .select("page_access_token")
          .eq("user_id", user.id)
          .eq("page_id", page_id)
          .single();
        if (!pageData) throw new Error("Page not found");

        const res = await fetch(`${GRAPH_API}/${page_id}/leadgen_forms?fields=id,name,status&access_token=${pageData.page_access_token}`);
        const data = await res.json();
        if (!res.ok) throw new Error(`Facebook API error: ${JSON.stringify(data)}`);
        return new Response(JSON.stringify({ forms: data.data || [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ===== SAVE SELECTED FORMS =====
      case "save_lead_forms": {
        const { forms, page_id } = body; // [{form_id, form_name, form_status}]
        for (const form of forms) {
          await supabase.from("facebook_lead_forms").upsert(
            { user_id: user.id, page_id, form_id: form.form_id, form_name: form.form_name, form_status: form.form_status || "active" },
            { onConflict: "user_id,form_id" }
          );
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ===== FETCH LEADS FROM A FORM =====
      case "fetch_leads": {
        const { form_id, page_id } = body;
        const { data: pageData } = await supabase
          .from("facebook_pages")
          .select("page_access_token")
          .eq("user_id", user.id)
          .eq("page_id", page_id)
          .single();
        if (!pageData) throw new Error("Page not found");

        const res = await fetch(`${GRAPH_API}/${form_id}/leads?fields=id,created_time,field_data&access_token=${pageData.page_access_token}`);
        const data = await res.json();
        if (!res.ok) throw new Error(`Facebook API error: ${JSON.stringify(data)}`);
        return new Response(JSON.stringify({ leads: data.data || [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ===== GET MESSENGER CONVERSATIONS =====
      case "get_conversations": {
        const { page_id } = body;
        const { data: pageData } = await supabase
          .from("facebook_pages")
          .select("page_access_token")
          .eq("user_id", user.id)
          .eq("page_id", page_id)
          .single();
        if (!pageData) throw new Error("Page not found");

        const res = await fetch(`${GRAPH_API}/${page_id}/conversations?fields=id,updated_time,participants,messages.limit(5){message,from,created_time}&access_token=${pageData.page_access_token}`);
        const data = await res.json();
        if (!res.ok) throw new Error(`Facebook API error: ${JSON.stringify(data)}`);
        return new Response(JSON.stringify({ conversations: data.data || [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ===== GET AD ACCOUNTS =====
      case "get_ad_accounts": {
        const res = await fetch(`${GRAPH_API}/me/adaccounts?fields=id,name,account_status,currency&access_token=${fbToken}`);
        const data = await res.json();
        if (!res.ok) throw new Error(`Facebook API error: ${JSON.stringify(data)}`);
        return new Response(JSON.stringify({ ad_accounts: data.data || [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ===== GET CAMPAIGNS =====
      case "get_campaigns": {
        const { ad_account_id } = body;
        const res = await fetch(
          `${GRAPH_API}/${ad_account_id}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,insights.date_preset(maximum){spend,impressions,clicks,actions}&limit=100&access_token=${fbToken}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(`Facebook API error: ${JSON.stringify(data)}`);

        // Parse and store campaigns
        const campaigns = (data.data || []).map((c: any) => {
          const insights = c.insights?.data?.[0] || {};
          const leadActions = (insights.actions || []).find((a: any) => a.action_type === "lead");
          return {
            user_id: user.id,
            campaign_id: c.id,
            campaign_name: c.name,
            status: c.status,
            objective: c.objective,
            daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
            lifetime_budget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
            spend: insights.spend ? Number(insights.spend) : 0,
            impressions: insights.impressions ? Number(insights.impressions) : 0,
            clicks: insights.clicks ? Number(insights.clicks) : 0,
            leads: leadActions ? Number(leadActions.value) : 0,
            cpl: leadActions && insights.spend ? Number(insights.spend) / Number(leadActions.value) : null,
            start_time: c.start_time || null,
            stop_time: c.stop_time || null,
            ad_account_id,
          };
        });

        // Upsert campaigns
        for (const campaign of campaigns) {
          await supabase.from("meta_campaigns").upsert(campaign, { onConflict: "user_id,campaign_id" });
        }

        return new Response(JSON.stringify({ campaigns, total: campaigns.length }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ===== GET CONNECTION STATUS =====
      case "status": {
        const { data: pages } = await supabase.from("facebook_pages").select("page_id, page_name").eq("user_id", user.id);
        const { data: forms } = await supabase.from("facebook_lead_forms").select("form_id, form_name, page_id, is_syncing").eq("user_id", user.id);
        const { data: campaigns } = await supabase.from("meta_campaigns").select("campaign_id").eq("user_id", user.id);
        return new Response(JSON.stringify({
          connected: true,
          pages: pages || [],
          forms: forms || [],
          campaigns_count: campaigns?.length || 0,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ===== DISCONNECT =====
      case "disconnect": {
        await supabase.from("facebook_lead_forms").delete().eq("user_id", user.id);
        await supabase.from("facebook_messages").delete().eq("user_id", user.id);
        await supabase.from("meta_campaigns").delete().eq("user_id", user.id);
        await supabase.from("facebook_pages").delete().eq("user_id", user.id);
        await supabase.from("facebook_tokens").delete().eq("user_id", user.id);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (e) {
    console.error("Facebook API error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
