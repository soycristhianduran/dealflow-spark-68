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

    // Only fetch FB token for actions that need it
    const actionsNeedingToken = ["get_pages", "get_ad_accounts", "get_campaigns", "update_campaign_status", "get_ads_structure", "update_entity_status", "create_campaign"];
    let fbToken: string | null = null;
    if (actionsNeedingToken.includes(action)) {
      fbToken = await getFbToken(supabase, user.id);
    }

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
        const subscriptionResults: { page_id: string; subscribed: boolean; error?: string }[] = [];

        for (const page of pages) {
          await supabase.from("facebook_pages").upsert(
            { user_id: user.id, page_id: page.page_id, page_name: page.page_name, page_access_token: page.page_access_token },
            { onConflict: "user_id,page_id" }
          );

          // Auto-subscribe the page to the app's webhook for leadgen
          try {
            const subRes = await fetch(
              `${GRAPH_API}/${page.page_id}/subscribed_apps`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  subscribed_fields: ["leadgen"],
                  access_token: page.page_access_token,
                }),
              }
            );
            const subData = await subRes.json();
            if (subData.success) {
              console.log(`Page ${page.page_id} subscribed to webhook`);
              subscriptionResults.push({ page_id: page.page_id, subscribed: true });
            } else {
              console.error(`Failed to subscribe page ${page.page_id}:`, subData);
              subscriptionResults.push({ page_id: page.page_id, subscribed: false, error: JSON.stringify(subData.error || subData) });
            }
          } catch (subErr) {
            console.error(`Error subscribing page ${page.page_id}:`, subErr);
            subscriptionResults.push({ page_id: page.page_id, subscribed: false, error: String(subErr) });
          }
        }

        return new Response(JSON.stringify({ success: true, subscriptions: subscriptionResults }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ===== GET LEAD FORMS FOR A PAGE (with fields) =====
      case "get_lead_forms": {
        const { page_id } = body;
        const { data: pageData } = await supabase
          .from("facebook_pages")
          .select("page_access_token")
          .eq("user_id", user.id)
          .eq("page_id", page_id)
          .single();
        if (!pageData) throw new Error("Page not found");

        const res = await fetch(`${GRAPH_API}/${page_id}/leadgen_forms?fields=id,name,status,questions&access_token=${pageData.page_access_token}`);
        const data = await res.json();
        if (!res.ok) throw new Error(`Facebook API error: ${JSON.stringify(data)}`);
        return new Response(JSON.stringify({ forms: data.data || [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ===== SAVE FIELD MAPPINGS =====
      case "save_field_mappings": {
        const { form_id, mappings } = body; // mappings: [{fb_field_name, contact_field, is_custom_field}]
        // Delete old mappings for this form
        await supabase
          .from("facebook_field_mappings")
          .delete()
          .eq("user_id", user.id)
          .eq("form_id", form_id);
        // Insert new mappings
        if (mappings && mappings.length > 0) {
          await supabase.from("facebook_field_mappings").insert(
            mappings.map((m: any) => ({
              user_id: user.id,
              form_id,
              fb_field_name: m.fb_field_name,
              contact_field: m.contact_field,
              is_custom_field: m.is_custom_field || false,
            }))
          );
        }
        return new Response(JSON.stringify({ success: true }), {
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

      // ===== FETCH LEADS FROM A FORM & AUTO-CREATE CONTACTS + DEALS =====
      case "fetch_leads": {
        const { form_id, page_id } = body;
        const { data: pageData } = await supabase
          .from("facebook_pages")
          .select("page_access_token")
          .eq("user_id", user.id)
          .eq("page_id", page_id)
          .single();
        if (!pageData) throw new Error("Page not found");

        const res = await fetch(`${GRAPH_API}/${form_id}/leads?fields=id,created_time,field_data,ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name&access_token=${pageData.page_access_token}`);
        const data = await res.json();
        if (!res.ok) throw new Error(`Facebook API error: ${JSON.stringify(data)}`);

        const fbLeads = data.data || [];

        // Load user-defined field mappings for this form
        const { data: userMappings } = await supabase
          .from("facebook_field_mappings")
          .select("fb_field_name, contact_field, is_custom_field")
          .eq("user_id", user.id)
          .eq("form_id", form_id);

        const hasCustomMappings = userMappings && userMappings.length > 0;

        // Get first pipeline and its first stage for auto-deal creation
        const { data: pipeline } = await supabase
          .from("pipelines")
          .select("id")
          .order("created_at", { ascending: true })
          .limit(1)
          .single();

        let firstStageId: string | null = null;
        if (pipeline) {
          const { data: stage } = await supabase
            .from("pipeline_stages")
            .select("id")
            .eq("pipeline_id", pipeline.id)
            .order("order", { ascending: true })
            .limit(1)
            .single();
          firstStageId = stage?.id || null;
        }

        // Standard contact columns that can be mapped
        const standardColumns = new Set([
          "full_name", "first_name", "last_name", "primary_email", "primary_phone",
          "birthday", "city", "country",
          "language", "timezone", "preferred_channel", "notes", "source",
          "campaign", "adset", "ad", "landing_page",
          "utm_source", "utm_medium", "utm_campaign", "utm_content",
        ]);

        let createdContacts = 0;
        let createdDeals = 0;

        for (const lead of fbLeads) {
          const fields: Record<string, string> = {};
          for (const fd of (lead.field_data || [])) {
            const key = (fd.name || "").toLowerCase();
            fields[key] = (fd.values || [])[0] || "";
          }

          let contactData: Record<string, any> = {
            source: "facebook",
            campaign: lead.campaign_name || lead.campaign_id || form_id,
            adset: lead.adset_name || lead.adset_id || null,
            ad: lead.ad_name || lead.ad_id || null,
            status: "new",
            owner_id: user.id,
          };
          let customFields: Record<string, string> = {};

          if (hasCustomMappings) {
            for (const mapping of userMappings!) {
              const value = fields[mapping.fb_field_name.toLowerCase()] || "";
              if (!value) continue;
              if (mapping.is_custom_field) {
                customFields[mapping.contact_field] = value;
              } else if (standardColumns.has(mapping.contact_field)) {
                contactData[mapping.contact_field] = value;
              }
            }
          } else {
            // Fallback: auto-detect common fields
            contactData.first_name = fields["first_name"] || fields["nombre"] || null;
            contactData.last_name = fields["last_name"] || fields["apellido"] || fields["apellidos"] || null;
            contactData.primary_email = fields["email"] || fields["correo"] || fields["correo_electrónico"] || null;
            contactData.primary_phone = fields["phone_number"] || fields["telefono"] || fields["teléfono"] || fields["phone"] || fields["número_de_teléfono"] || null;
            contactData.birthday = fields["date_of_birth"] || fields["fecha_de_nacimiento"] || fields["birthday"] || null;
            contactData.city = fields["city"] || fields["ciudad"] || null;
            contactData.country = fields["country"] || fields["país"] || null;

            // If no first/last, try full_name
            if (!contactData.first_name) {
              const fullNameRaw = fields["full_name"] || fields["nombre_completo"] || fields["name"] || "";
              if (fullNameRaw) {
                const parts = fullNameRaw.trim().split(/\s+/);
                contactData.first_name = parts[0] || null;
                contactData.last_name = parts.slice(1).join(" ") || null;
              }
            }
          }

          // Compose full_name from first + last
          const firstName = contactData.first_name || "";
          const lastName = contactData.last_name || "";
          contactData.full_name = [firstName, lastName].filter(Boolean).join(" ") || "Lead Facebook";

          if (Object.keys(customFields).length > 0) {
            contactData.custom_fields = customFields;
          }

          // Dedup: check if contact already exists by email or phone
          let existingContactId: string | null = null;
          const email = contactData.primary_email;
          const phone = contactData.primary_phone;
          if (email) {
            const { data: byEmail } = await supabase
              .from("contacts")
              .select("id")
              .eq("primary_email", email)
              .limit(1)
              .maybeSingle();
            existingContactId = byEmail?.id || null;
          }
          if (!existingContactId && phone) {
            const { data: byPhone } = await supabase
              .from("contacts")
              .select("id")
              .eq("primary_phone", phone)
              .limit(1)
              .maybeSingle();
            existingContactId = byPhone?.id || null;
          }

          if (existingContactId) continue;

          // Create new contact
          const { data: newContact, error: contactErr } = await supabase
            .from("contacts")
            .insert(contactData)
            .select("id")
            .single();

          if (contactErr || !newContact) {
            console.error("Error creating contact from FB lead:", contactErr);
            continue;
          }
          createdContacts++;

          // Create deal in first pipeline stage
          if (pipeline && firstStageId) {
            const { error: dealErr } = await supabase
              .from("deals")
              .insert({
                title: `Lead FB - ${contactData.full_name}`,
                contact_id: newContact.id,
                pipeline_id: pipeline.id,
                stage_id: firstStageId,
                owner_id: user.id,
                value: 0,
                currency: "USD",
                status: "open",
                source: "facebook",
              });
            if (!dealErr) createdDeals++;
            else console.error("Error creating deal from FB lead:", dealErr);
          }
        }

        return new Response(JSON.stringify({
          leads: fbLeads,
          imported: { contacts: createdContacts, deals: createdDeals },
        }), {
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
        const res = await fetch(`${GRAPH_API}/me/adaccounts?fields=id,name,account_status,currency&limit=500&access_token=${fbToken}`);
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

      // ===== SUBSCRIBE PAGE TO LEADGEN WEBHOOK =====
      case "subscribe_leadgen": {
        const { data: userPages } = await supabase
          .from("facebook_pages")
          .select("page_id, page_name, page_access_token")
          .eq("user_id", user.id);

        if (!userPages || userPages.length === 0) {
          return new Response(JSON.stringify({ error: "No pages found" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const results: { page_id: string; page_name: string; subscribed: boolean; error?: string }[] = [];

        for (const page of userPages) {
          try {
            const subRes = await fetch(
              `${GRAPH_API}/${page.page_id}/subscribed_apps`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  subscribed_fields: ["leadgen"],
                  access_token: page.page_access_token,
                }),
              }
            );
            const subData = await subRes.json();
            if (subData.success) {
              console.log(`Page ${page.page_id} (${page.page_name}) subscribed to leadgen`);
              results.push({ page_id: page.page_id, page_name: page.page_name, subscribed: true });
            } else {
              console.error(`Failed to subscribe page ${page.page_id}:`, subData);
              results.push({ page_id: page.page_id, page_name: page.page_name, subscribed: false, error: subData.error?.message || JSON.stringify(subData) });
            }
          } catch (err) {
            results.push({ page_id: page.page_id, page_name: page.page_name, subscribed: false, error: String(err) });
          }
        }

        const allOk = results.every(r => r.subscribed);
        return new Response(JSON.stringify({ success: allOk, results }), {
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

      // ===== FETCH AD SETS + ADS WITH CREATIVE DATA =====
      case "get_ads_structure": {
        const { ad_account_id } = body;

        // ── Ad Sets ────────────────────────────────────────────────────────
        const adsetsUrl = `${GRAPH_API}/${ad_account_id}/adsets` +
          `?fields=id,name,status,campaign_id,daily_budget,lifetime_budget` +
          `,insights.date_preset(maximum){spend,impressions,clicks,actions}` +
          `&limit=200&access_token=${fbToken}`;

        const adsetsRes = await fetch(adsetsUrl);
        const adsetsData = await adsetsRes.json();
        if (!adsetsRes.ok) throw new Error(`Meta API (adsets): ${JSON.stringify(adsetsData)}`);

        const adsets = (adsetsData.data || []).map((s: any) => {
          const ins = s.insights?.data?.[0] || {};
          const leadActions = (ins.actions || []).find((a: any) => a.action_type === "lead");
          const leads = leadActions ? Number(leadActions.value) : 0;
          const spend = ins.spend ? Number(ins.spend) : 0;
          return {
            user_id: user.id,
            adset_id: s.id,
            adset_name: s.name,
            campaign_id: s.campaign_id,
            status: s.status,
            daily_budget:    s.daily_budget    ? Number(s.daily_budget)    / 100 : null,
            lifetime_budget: s.lifetime_budget ? Number(s.lifetime_budget) / 100 : null,
            spend,
            impressions: ins.impressions ? Number(ins.impressions) : 0,
            clicks:      ins.clicks      ? Number(ins.clicks)      : 0,
            leads,
            cpl: leads > 0 ? spend / leads : null,
            ad_account_id,
          };
        });

        for (const adset of adsets) {
          await supabase.from("meta_adsets").upsert(adset, { onConflict: "user_id,adset_id" });
        }

        // ── Ads with creative ──────────────────────────────────────────────
        const adsUrl = `${GRAPH_API}/${ad_account_id}/ads` +
          `?fields=id,name,status,adset_id,campaign_id` +
          `,creative{id,name,title,body,image_url,thumbnail_url,video_id,call_to_action_type,object_story_spec}` +
          `,insights.date_preset(maximum){spend,impressions,clicks,actions}` +
          `&limit=200&access_token=${fbToken}`;

        const adsRes = await fetch(adsUrl);
        const adsRawData = await adsRes.json();
        if (!adsRes.ok) throw new Error(`Meta API (ads): ${JSON.stringify(adsRawData)}`);

        const adsPromises = (adsRawData.data || []).map(async (a: any) => {
          const cr = a.creative || {};
          const oss = cr.object_story_spec || {};
          // Try to extract text from object_story_spec for any ad format
          const linkData  = oss.link_data  || oss.video_data || oss.photo_data || {};
          const headline  = cr.title   || linkData.name    || "";
          const body      = cr.body    || linkData.message || "";
          const imageUrl  = cr.image_url || cr.thumbnail_url || linkData.picture || linkData.image_url || "";
          const cta       = cr.call_to_action_type || linkData.call_to_action?.type || "";

          const videoId = cr.video_id || oss.video_data?.video_id || null;
          let videoUrl: string | null = null;
          let thumbUrl: string | null = null;

          // For video ads, fetch the actual CDN source URL
          if (videoId) {
            try {
              const vRes = await fetch(`${GRAPH_API}/${videoId}?fields=source,picture&access_token=${fbToken}`);
              const vData = await vRes.json();
              if (vData.source) videoUrl = vData.source;
              if (vData.picture) thumbUrl = vData.picture;
            } catch (_) { /* ignore */ }
          }

          // Final image/thumbnail: prefer video thumbnail, then existing image extraction
          const finalImageUrl = thumbUrl || imageUrl || oss.video_data?.image_url || "";

          const ins = a.insights?.data?.[0] || {};
          const leadActions = (ins.actions || []).find((x: any) => x.action_type === "lead");
          const leads = leadActions ? Number(leadActions.value) : 0;
          const spend = ins.spend ? Number(ins.spend) : 0;

          return {
            user_id: user.id,
            ad_id:      a.id,
            ad_name:    a.name,
            adset_id:   a.adset_id,
            campaign_id: a.campaign_id,
            status:      a.status,
            creative_id: cr.id || null,
            headline:    headline || null,
            body:        body    || null,
            image_url:   finalImageUrl || null,
            video_id:    videoId || null,
            video_url:   videoUrl || null,
            call_to_action: cta || null,
            spend,
            impressions: ins.impressions ? Number(ins.impressions) : 0,
            clicks:      ins.clicks      ? Number(ins.clicks)      : 0,
            leads,
            cpl: leads > 0 ? spend / leads : null,
            ad_account_id,
          };
        });

        const ads = await Promise.all(adsPromises);

        for (const ad of ads) {
          await supabase.from("meta_ads").upsert(ad, { onConflict: "user_id,ad_id" });
        }

        return new Response(
          JSON.stringify({ adsets: adsets.length, ads: ads.length }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ===== UPDATE STATUS FOR ANY META ENTITY (campaign / adset / ad) =====
      case "update_entity_status": {
        const { entity_id, entity_type, new_status } = body;
        if (!entity_id || !entity_type || !["ACTIVE", "PAUSED"].includes(new_status)) {
          return new Response(
            JSON.stringify({ error: "entity_id, entity_type and new_status (ACTIVE|PAUSED) are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const updateRes = await fetch(`${GRAPH_API}/${entity_id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: new_status, access_token: fbToken }),
        });
        const updateData = await updateRes.json();
        if (!updateRes.ok || updateData.error) {
          throw new Error(`Meta API error: ${updateData.error?.message || JSON.stringify(updateData)}`);
        }

        // Reflect in correct local table
        const tableMap: Record<string, string> = {
          campaign: "meta_campaigns",
          adset:    "meta_adsets",
          ad:       "meta_ads",
        };
        const idColMap: Record<string, string> = {
          campaign: "campaign_id",
          adset:    "adset_id",
          ad:       "ad_id",
        };
        const table = tableMap[entity_type];
        const idCol = idColMap[entity_type];
        if (table && idCol) {
          await supabase.from(table).update({ status: new_status })
            .eq("user_id", user.id).eq(idCol, entity_id);
        }

        return new Response(
          JSON.stringify({ success: true, entity_id, entity_type, status: new_status }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ===== PAUSE / ACTIVATE CAMPAIGN =====
      case "update_campaign_status": {
        const { campaign_id, new_status } = body; // new_status: "ACTIVE" | "PAUSED"
        if (!campaign_id || !["ACTIVE", "PAUSED"].includes(new_status)) {
          return new Response(JSON.stringify({ error: "campaign_id and new_status (ACTIVE|PAUSED) are required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const updateRes = await fetch(`${GRAPH_API}/${campaign_id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: new_status, access_token: fbToken }),
        });
        const updateData = await updateRes.json();

        if (!updateRes.ok || updateData.error) {
          throw new Error(`Meta API error: ${updateData.error?.message || JSON.stringify(updateData)}`);
        }

        // Reflect the new status in our local table
        await supabase
          .from("meta_campaigns")
          .update({ status: new_status })
          .eq("user_id", user.id)
          .eq("campaign_id", campaign_id);

        return new Response(JSON.stringify({ success: true, campaign_id, status: new_status }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ===== CREATE CAMPAIGN =====
      case "create_campaign": {
        const { ad_account_id, name, objective, status, daily_budget, special_ad_categories } = body;

        // Normalize ad account ID: stored values may already be "act_12345" or just "12345".
        // The Graph API endpoint needs exactly one "act_" prefix.
        const rawAccountId = String(ad_account_id).replace(/^act_/, "");
        const accountEndpoint = `act_${rawAccountId}`;

        const params: Record<string, any> = {
          name,
          objective,
          status: status || "PAUSED",
          // For non-regulated ads (housing/employment/credit/political), send NONE
          special_ad_categories: special_ad_categories?.length ? special_ad_categories : ["NONE"],
          access_token: fbToken,
        };

        // CBO budget (optional): only include if provided and > 0.
        // Note: Meta requires budgets in the account currency's smallest unit
        // (cents for USD, no conversion needed for whole-unit currencies like COP).
        // We store the value as-is from the UI and send it in cents (× 100).
        if (daily_budget && Number(daily_budget) > 0) {
          params.daily_budget = Math.round(Number(daily_budget) * 100);
        }

        console.log("Creating campaign:", { endpoint: accountEndpoint, params: { ...params, access_token: "[hidden]" } });

        const createRes = await fetch(`${GRAPH_API}/${accountEndpoint}/campaigns`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });
        const createData = await createRes.json();

        console.log("Meta API response:", JSON.stringify(createData));

        if (!createRes.ok || createData.error) {
          const metaMsg = createData.error?.error_user_msg
            || createData.error?.message
            || JSON.stringify(createData);
          return new Response(
            JSON.stringify({ success: false, error: metaMsg }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Store the new campaign (metrics will come with next sync)
        const newCampaign = {
          user_id:         user.id,
          campaign_id:     createData.id,
          campaign_name:   name,
          status:          status || "PAUSED",
          objective,
          daily_budget:    daily_budget ? Number(daily_budget) : null,
          lifetime_budget: null,
          spend:           0,
          impressions:     0,
          clicks:          0,
          leads:           0,
          cpl:             null,
          start_time:      null,
          stop_time:       null,
          ad_account_id:   ad_account_id,
        };
        await supabase.from("meta_campaigns").insert(newCampaign);

        return new Response(
          JSON.stringify({ success: true, campaign_id: createData.id, campaign: newCampaign }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
