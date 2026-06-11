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
    const actionsNeedingToken = [
      "get_pages", "get_ad_accounts", "get_campaigns",
      "update_campaign_status", "get_ads_structure", "update_entity_status",
      "create_campaign", "create_adset", "create_ad",
      "get_lead_forms", "save_lead_forms", "fetch_leads", "subscribe_leadgen",
      "get_conversations", "get_video_url", "get_ad_preview",
    ];
    let fbToken: string | null = null;
    if (actionsNeedingToken.includes(action)) {
      fbToken = await getFbToken(supabase, user.id);
    }

    switch (action) {
      // ===== GET PAGES =====
      case "get_pages": {
        const res = await fetch(`${GRAPH_API}/me/accounts?fields=id,name,access_token,category&access_token=${fbToken}`);
        const data = await res.json();
        console.log("get_pages response:", JSON.stringify(data));
        if (!res.ok || data.error) {
          const metaMsg = data.error?.error_user_msg || data.error?.message || JSON.stringify(data);
          return new Response(
            JSON.stringify({ pages: [], error: metaMsg }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
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
        const { forms, page_id } = body; // [{form_id, form_name, form_status, pipeline_id?}]

        // Replace the selection for this page: remove forms that are no longer
        // selected, so deselecting a form actually un-integrates it.
        const keepIds = new Set((forms || []).map((f: any) => f.form_id));
        const { data: existingForms } = await supabase
          .from("facebook_lead_forms")
          .select("form_id")
          .eq("user_id", user.id)
          .eq("page_id", page_id);
        const toDelete = (existingForms || [])
          .map((e: any) => e.form_id)
          .filter((id: string) => !keepIds.has(id));
        if (toDelete.length) {
          await supabase.from("facebook_lead_forms")
            .delete().eq("user_id", user.id).in("form_id", toDelete);
        }

        for (const form of forms) {
          const row: Record<string, any> = {
            user_id: user.id,
            page_id,
            form_id: form.form_id,
            form_name: form.form_name,
            form_status: form.form_status || "active",
            // Persist pipeline_id even when cleared (null) so re-saving without a
            // pipeline doesn't keep a stale one.
            pipeline_id: form.pipeline_id ?? null,
          };
          await supabase.from("facebook_lead_forms").upsert(row, { onConflict: "user_id,form_id" });
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

        // Resolve the connector's organization so imported contacts are scoped.
        const { data: orgMember } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();
        const orgId = orgMember?.organization_id ?? null;

        // Paginate through ALL available leads (Meta retains ~90 days). Cap at
        // 30 pages × 100 = 3000 to stay within the function timeout.
        const fbLeads: any[] = [];
        let nextUrl: string | null =
          `${GRAPH_API}/${form_id}/leads?fields=id,created_time,field_data,ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name&limit=100&access_token=${pageData.page_access_token}`;
        let pageCount = 0;
        while (nextUrl && pageCount < 30) {
          const res = await fetch(nextUrl);
          const data = await res.json();
          if (!res.ok) throw new Error(`Facebook API error: ${JSON.stringify(data)}`);
          fbLeads.push(...(data.data || []));
          nextUrl = data.paging?.next || null;
          pageCount++;
        }

        // Resolve campaign / adset / ad IDs to their NAMES. The lead object often
        // returns only the IDs (or nothing), so we batch-look-up the names via the
        // user token (ads_read). Falls back to the ID when a name isn't available.
        const nameMap: Record<string, string> = {};
        const idSet = new Set<string>();
        for (const l of fbLeads) {
          for (const id of [l.campaign_id, l.adset_id, l.ad_id]) if (id) idSet.add(String(id));
        }
        const allIds = [...idSet];
        if (fbToken && allIds.length) {
          for (let i = 0; i < allIds.length; i += 50) {
            const part = allIds.slice(i, i + 50);
            try {
              const r = await fetch(`${GRAPH_API}/?ids=${part.join(",")}&fields=name&access_token=${fbToken}`);
              const j = await r.json();
              if (r.ok && j && typeof j === "object") {
                for (const [id, obj] of Object.entries(j)) {
                  const nm = (obj as any)?.name;
                  if (nm) nameMap[id] = nm;
                }
              }
            } catch (_) { /* fall back to IDs */ }
          }
        }

        // Load user-defined field mappings for this form
        const { data: userMappings } = await supabase
          .from("facebook_field_mappings")
          .select("fb_field_name, contact_field, is_custom_field")
          .eq("user_id", user.id)
          .eq("form_id", form_id);

        const hasCustomMappings = userMappings && userMappings.length > 0;

        // Get the pipeline configured for this form, or fall back to the first one
        const { data: formConfig } = await supabase
          .from("facebook_lead_forms")
          .select("pipeline_id")
          .eq("user_id", user.id)
          .eq("form_id", form_id)
          .maybeSingle();

        // Use the pipeline configured for THIS form (chosen in the wizard); fall
        // back to the org's first pipeline only if none was set.
        let pipeline: { id: string } | null = null;
        if (formConfig?.pipeline_id) {
          ({ data: pipeline } = await supabase.from("pipelines").select("id").eq("id", formConfig.pipeline_id).maybeSingle());
        }
        if (!pipeline) {
          let pq = supabase.from("pipelines").select("id").order("created_at", { ascending: true }).limit(1);
          if (orgId) pq = pq.eq("organization_id", orgId);
          ({ data: pipeline } = await pq.maybeSingle());
        }

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
        let updatedContacts = 0;

        for (const lead of fbLeads) {
          const fields: Record<string, string> = {};
          for (const fd of (lead.field_data || [])) {
            const key = (fd.name || "").toLowerCase();
            fields[key] = (fd.values || [])[0] || "";
          }

          let contactData: Record<string, any> = {
            organization_id: orgId,
            source: "facebook",
            // Prefer resolved NAMES; fall back to the lead's own name, then the ID.
            campaign: (lead.campaign_id && nameMap[lead.campaign_id]) || lead.campaign_name || lead.campaign_id || null,
            adset:    (lead.adset_id && nameMap[lead.adset_id])       || lead.adset_name    || lead.adset_id    || null,
            ad:       (lead.ad_id && nameMap[lead.ad_id])             || lead.ad_name       || lead.ad_id       || null,
            meta_campaign_id: lead.campaign_id || null,
            meta_ad_id:       lead.ad_id       || null,
            meta_adset_id:    lead.adset_id    || null,
            utm_source:       "facebook",
            utm_medium:       "paid_social",
            utm_campaign:     (lead.campaign_id && nameMap[lead.campaign_id]) || lead.campaign_name || lead.campaign_id || null,
            utm_content:      (lead.ad_id && nameMap[lead.ad_id]) || lead.ad_name || lead.ad_id || null,
            status: "new",
            owner_id: user.id,
            // Unified Leads+Deals model: the contact IS the pipeline entity, so
            // assign the form's pipeline + first stage directly on the contact
            // (this is what makes it show up in the selected pipeline).
            ...(pipeline ? { pipeline_id: pipeline.id, lead_status: "active" } : {}),
            ...(firstStageId ? { stage_id: firstStageId } : {}),
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
            let eq = supabase.from("contacts").select("id").eq("primary_email", email).limit(1);
            if (orgId) eq = eq.eq("organization_id", orgId);
            const { data: byEmail } = await eq.maybeSingle();
            existingContactId = byEmail?.id || null;
          }
          if (!existingContactId && phone) {
            let pq2 = supabase.from("contacts").select("id").eq("primary_phone", phone).limit(1);
            if (orgId) pq2 = pq2.eq("organization_id", orgId);
            const { data: byPhone } = await pq2.maybeSingle();
            existingContactId = byPhone?.id || null;
          }

          if (existingContactId) {
            // Refresh attribution (names + ids) on the existing lead. Only set
            // the pipeline if it has none yet — don't move leads already placed.
            const patch: Record<string, any> = {
              campaign: contactData.campaign,
              adset: contactData.adset,
              ad: contactData.ad,
              meta_campaign_id: contactData.meta_campaign_id,
              meta_adset_id: contactData.meta_adset_id,
              meta_ad_id: contactData.meta_ad_id,
            };
            const { data: ex } = await supabase.from("contacts").select("pipeline_id").eq("id", existingContactId).maybeSingle();
            if (!ex?.pipeline_id && pipeline && firstStageId) {
              patch.pipeline_id = pipeline.id;
              patch.stage_id = firstStageId;
              patch.lead_status = "active";
            }
            await supabase.from("contacts").update(patch).eq("id", existingContactId);
            updatedContacts++;
            continue;
          }

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
          // The contact was already inserted with pipeline_id + stage_id above
          // (unified model), so it shows up in the selected pipeline. No separate
          // deal row is created.
          if (pipeline && firstStageId) createdDeals++;
        }

        return new Response(JSON.stringify({
          leads: fbLeads,
          imported: { contacts: createdContacts, updated: updatedContacts, deals: createdDeals },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ===== GET AD PREVIEW (iframe) + creative caption =====
      case "get_ad_preview": {
        const { ad_id } = body;
        if (!ad_id) throw new Error("ad_id is required");

        // 1) Rendered preview iframes for the common placements.
        const formats = ["MOBILE_FEED_STANDARD", "INSTAGRAM_STANDARD", "DESKTOP_FEED_STANDARD"];
        const previews: { format: string; body: string }[] = [];
        for (const fmt of formats) {
          try {
            const r = await fetch(`${GRAPH_API}/${ad_id}/previews?ad_format=${fmt}&access_token=${fbToken}`);
            const j = await r.json();
            const html = j?.data?.[0]?.body;
            if (r.ok && html) previews.push({ format: fmt, body: html });
          } catch (_) { /* skip format */ }
        }

        // 2) Creative details for caption + media (fallback / extra info).
        let creative: any = null;
        try {
          const cr = await fetch(
            `${GRAPH_API}/${ad_id}?fields=name,creative{body,title,image_url,thumbnail_url,video_id,object_story_spec}&access_token=${fbToken}`,
          );
          const cj = await cr.json();
          if (cr.ok) {
            const c = cj.creative || {};
            const spec = c.object_story_spec || {};
            const linkData = spec.link_data || {};
            const videoData = spec.video_data || {};
            creative = {
              name: cj.name || null,
              caption: c.body || linkData.message || videoData.message || c.title || null,
              title: c.title || linkData.name || null,
              image_url: c.image_url || linkData.picture || c.thumbnail_url || null,
              video_id: c.video_id || videoData.video_id || null,
              child_attachments: linkData.child_attachments || null, // carousel
            };
          }
        } catch (_) { /* no creative */ }

        return new Response(JSON.stringify({ previews, creative }), {
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

        // Replace campaigns for this ad account: delete stale ones first so
        // removed/archived campaigns don't linger from a previous sync.
        await supabase.from("meta_campaigns").delete()
          .eq("user_id", user.id)
          .eq("ad_account_id", ad_account_id);

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
        // Clear ALL Meta/Facebook data for this user on disconnect so that
        // reconnecting with a different account starts with a clean slate.
        await supabase.from("facebook_lead_forms").delete().eq("user_id", user.id);
        await supabase.from("facebook_messages").delete().eq("user_id", user.id);
        await supabase.from("meta_ads").delete().eq("user_id", user.id);
        await supabase.from("meta_adsets").delete().eq("user_id", user.id);
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

        // Replace adsets for this ad account (same stale-data reasoning as campaigns)
        await supabase.from("meta_adsets").delete()
          .eq("user_id", user.id)
          .eq("ad_account_id", ad_account_id);

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

          // Final image/thumbnail: prefer existing image extraction (video URL fetched lazily)
          const finalImageUrl = imageUrl || oss.video_data?.image_url || "";

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

        // Replace ads for this ad account (delete first to remove stale/deleted ads)
        await supabase.from("meta_ads").delete()
          .eq("user_id", user.id)
          .eq("ad_account_id", ad_account_id);

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
          // Return 200 so Supabase client puts the body in `data` (not in error.context).
          // The caller checks `res.success === false` to detect failure.
          return new Response(
            JSON.stringify({ success: false, error: metaMsg }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

      // ── Create Ad Set ─────────────────────────────────────────────────────
      case "create_adset": {
        const {
          ad_account_id, campaign_id, name, optimization_goal,
          daily_budget, start_time, end_time,
          age_min, age_max, genders, countries, status,
        } = body;

        const rawAccId = String(ad_account_id).replace(/^act_/, "");
        const acctEp   = `act_${rawAccId}`;

        // Auto-select billing event from optimization goal
        const BILLING: Record<string, string> = {
          LEAD_GENERATION:     "IMPRESSIONS",
          LINK_CLICKS:         "LINK_CLICKS",
          REACH:               "IMPRESSIONS",
          VIDEO_VIEWS:         "VIDEO_VIEWS",
          OFFSITE_CONVERSIONS: "IMPRESSIONS",
          POST_ENGAGEMENT:     "IMPRESSIONS",
          APP_INSTALLS:        "IMPRESSIONS",
        };
        const billing_event = BILLING[optimization_goal] || "IMPRESSIONS";

        const targeting: Record<string, any> = {
          age_min: age_min || 18,
          age_max: age_max || 65,
          geo_locations: { countries: countries?.length ? countries : ["CO"] },
        };
        if (genders?.length) targeting.genders = genders; // 1=men, 2=women

        const adsetParams: Record<string, any> = {
          name,
          campaign_id,
          optimization_goal,
          billing_event,
          targeting:  JSON.stringify(targeting),
          status:     status || "PAUSED",
          access_token: fbToken,
        };
        if (daily_budget && Number(daily_budget) > 0)
          adsetParams.daily_budget = Math.round(Number(daily_budget) * 100);
        if (start_time) adsetParams.start_time = start_time;
        if (end_time)   adsetParams.end_time   = end_time;

        console.log("Creating adset:", { endpoint: acctEp, params: { ...adsetParams, access_token: "[hidden]" } });

        const adsetRes  = await fetch(`${GRAPH_API}/${acctEp}/adsets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(adsetParams),
        });
        const adsetData = await adsetRes.json();
        console.log("Create adset response:", JSON.stringify(adsetData));

        if (!adsetRes.ok || adsetData.error) {
          const msg = adsetData.error?.error_user_msg || adsetData.error?.message || JSON.stringify(adsetData);
          return new Response(JSON.stringify({ success: false, error: msg }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        await supabase.from("meta_adsets").upsert({
          user_id:       user.id,
          adset_id:      adsetData.id,
          adset_name:    name,
          campaign_id,
          status:        status || "PAUSED",
          daily_budget:  daily_budget ? Number(daily_budget) : null,
          ad_account_id,
        }, { onConflict: "user_id,adset_id" });

        return new Response(
          JSON.stringify({ success: true, adset_id: adsetData.id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ── Create Ad (uploads image → creates creative → creates ad) ─────────
      case "create_ad": {
        const {
          ad_account_id, adset_id, campaign_id, name,
          page_id, image_url, headline, body: adBody,
          link_url, call_to_action, status,
        } = body;

        const rawAccId2 = String(ad_account_id).replace(/^act_/, "");
        const acctEp2   = `act_${rawAccId2}`;

        // 1. Upload image → get hash (required by Meta for creatives)
        let imageHash: string | null = null;
        if (image_url) {
          const imgRes  = await fetch(`${GRAPH_API}/${acctEp2}/adimages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: image_url, access_token: fbToken }),
          });
          const imgData = await imgRes.json();
          console.log("Image upload response:", JSON.stringify(imgData));
          const imgKey  = Object.keys(imgData.images || {})[0];
          if (imgKey) imageHash = imgData.images[imgKey].hash;
        }

        // 2. Build link_data for the story spec
        const linkData: Record<string, any> = {
          link:        link_url,
          message:     adBody,
          name:        headline,
          call_to_action: { type: call_to_action || "LEARN_MORE" },
        };
        if (imageHash) linkData.image_hash = imageHash;

        // 3. Create ad creative
        const creativeRes  = await fetch(`${GRAPH_API}/${acctEp2}/adcreatives`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `${name} - Creative`,
            object_story_spec: JSON.stringify({ page_id, link_data: linkData }),
            access_token: fbToken,
          }),
        });
        const creativeData = await creativeRes.json();
        console.log("Create creative response:", JSON.stringify(creativeData));

        if (!creativeRes.ok || creativeData.error) {
          const msg = creativeData.error?.error_user_msg || creativeData.error?.message || JSON.stringify(creativeData);
          return new Response(JSON.stringify({ success: false, error: msg }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // 4. Create the ad
        const adRes  = await fetch(`${GRAPH_API}/${acctEp2}/ads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            adset_id,
            creative:     JSON.stringify({ creative_id: creativeData.id }),
            status:       status || "PAUSED",
            access_token: fbToken,
          }),
        });
        const adData = await adRes.json();
        console.log("Create ad response:", JSON.stringify(adData));

        if (!adRes.ok || adData.error) {
          const msg = adData.error?.error_user_msg || adData.error?.message || JSON.stringify(adData);
          return new Response(JSON.stringify({ success: false, error: msg }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // 5. Persist to meta_ads
        await supabase.from("meta_ads").upsert({
          user_id:       user.id,
          ad_id:         adData.id,
          ad_name:       name,
          adset_id,
          campaign_id:   campaign_id || "",
          status:        status || "PAUSED",
          creative_id:   creativeData.id,
          headline,
          body:          adBody,
          image_url,
          call_to_action,
          ad_account_id,
        }, { onConflict: "user_id,ad_id" });

        return new Response(
          JSON.stringify({ success: true, ad_id: adData.id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ===== LAZY-FETCH VIDEO URL (called when preview modal opens) =====
      case "get_video_url": {
        const { video_id } = body;
        if (!video_id) return new Response(JSON.stringify({ url: null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const vRes  = await fetch(`${GRAPH_API}/${video_id}?fields=source,picture&access_token=${fbToken}`);
        const vData = await vRes.json();
        return new Response(
          JSON.stringify({ url: vData.source || null, thumbnail: vData.picture || null }),
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
