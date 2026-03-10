import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ===== GET: Meta Webhook Verification =====
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const VERIFY_TOKEN = (Deno.env.get("FB_WEBHOOK_VERIFY_TOKEN") || "").trim();
    const receivedToken = (token || "").trim();

    if (mode === "subscribe" && receivedToken === VERIFY_TOKEN) {
      console.log("Webhook verified successfully");
      return new Response(challenge, { status: 200 });
    } else {
      console.error("Webhook verification failed", { mode, token });
      return new Response("Forbidden", { status: 403 });
    }
  }

  // ===== POST: Incoming webhook events =====
  if (req.method === "POST") {
    try {
      const body = await req.json();
      console.log("Webhook received:", JSON.stringify(body));

      if (body.object !== "page") {
        return new Response("OK", { status: 200 });
      }

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      for (const entry of body.entry || []) {
        const pageId = entry.id;

        for (const change of entry.changes || []) {
          if (change.field !== "leadgen") continue;

          const leadgenId = change.value?.leadgen_id;
          const formId = change.value?.form_id;
          if (!leadgenId || !formId) continue;

          console.log(`New lead: ${leadgenId} from form ${formId} on page ${pageId}`);

          // Find the page owner and token
          const { data: pageData } = await supabase
            .from("facebook_pages")
            .select("user_id, page_access_token")
            .eq("page_id", pageId)
            .limit(1)
            .maybeSingle();

          if (!pageData) {
            console.error(`No page found for page_id ${pageId}`);
            continue;
          }

          const { user_id: userId, page_access_token: pageToken } = pageData;

          // Fetch the lead data from Facebook
          const isTestLead = leadgenId.startsWith("TEST_");
          let fields: Record<string, string> = {};

          if (isTestLead) {
            console.log("Test lead detected, using placeholder data");
            fields = {
              full_name: "Lead de Prueba",
              first_name: "Lead",
              last_name: "de Prueba",
              email: `test_${Date.now()}@test.com`,
              phone_number: "+0000000000",
            };
          } else {
            const leadRes = await fetch(
              `${GRAPH_API}/${leadgenId}?access_token=${pageToken}`
            );
            const leadData = await leadRes.json();

            if (!leadRes.ok) {
              console.error("Error fetching lead:", JSON.stringify(leadData));
              continue;
            }

            // Parse field_data
            for (const fd of leadData.field_data || []) {
              fields[(fd.name || "").toLowerCase()] = (fd.values || [])[0] || "";
            }
          }

          // Load user-defined field mappings
          const { data: userMappings } = await supabase
            .from("facebook_field_mappings")
            .select("fb_field_name, contact_field, is_custom_field")
            .eq("user_id", userId)
            .eq("form_id", formId);

          const hasCustomMappings = userMappings && userMappings.length > 0;

          const standardColumns = new Set([
            "full_name", "first_name", "last_name", "primary_email", "primary_phone",
            "birthday", "city", "country", "language", "timezone",
            "preferred_channel", "notes", "source", "campaign", "adset", "ad",
            "landing_page", "utm_source", "utm_medium", "utm_campaign", "utm_content",
          ]);

          let contactData: Record<string, any> = {
            source: "facebook_ads",
            campaign: change.value?.campaign_name || change.value?.campaign_id || formId,
            adset: change.value?.adset_name || change.value?.adset_id || null,
            ad: change.value?.ad_name || change.value?.ad_id || null,
            status: "new",
            owner_id: userId,
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
            contactData.first_name = fields["first_name"] || fields["nombre"] || null;
            contactData.last_name = fields["last_name"] || fields["apellido"] || fields["apellidos"] || null;
            contactData.primary_email = fields["email"] || fields["correo"] || fields["correo_electrónico"] || null;
            contactData.primary_phone = fields["phone_number"] || fields["telefono"] || fields["teléfono"] || fields["phone"] || fields["número_de_teléfono"] || null;
            contactData.birthday = fields["date_of_birth"] || fields["fecha_de_nacimiento"] || fields["birthday"] || null;
            contactData.city = fields["city"] || fields["ciudad"] || null;
            contactData.country = fields["country"] || fields["país"] || null;

            if (!contactData.first_name) {
              const fullNameRaw = fields["full_name"] || fields["nombre_completo"] || fields["name"] || "";
              if (fullNameRaw) {
                const parts = fullNameRaw.trim().split(/\s+/);
                contactData.first_name = parts[0] || null;
                contactData.last_name = parts.slice(1).join(" ") || null;
              }
            }
          }

          const firstName = contactData.first_name || "";
          const lastName = contactData.last_name || "";
          contactData.full_name = [firstName, lastName].filter(Boolean).join(" ") || "Lead Facebook";

          if (Object.keys(customFields).length > 0) {
            contactData.custom_fields = customFields;
          }

          // Dedup by email or phone
          let existingContactId: string | null = null;
          if (contactData.primary_email) {
            const { data: byEmail } = await supabase
              .from("contacts")
              .select("id")
              .eq("primary_email", contactData.primary_email)
              .limit(1)
              .maybeSingle();
            existingContactId = byEmail?.id || null;
          }
          if (!existingContactId && contactData.primary_phone) {
            const { data: byPhone } = await supabase
              .from("contacts")
              .select("id")
              .eq("primary_phone", contactData.primary_phone)
              .limit(1)
              .maybeSingle();
            existingContactId = byPhone?.id || null;
          }

          if (existingContactId) {
            console.log(`Lead already exists as contact ${existingContactId}, skipping`);
            continue;
          }

          // Create contact
          const { data: newContact, error: contactErr } = await supabase
            .from("contacts")
            .insert(contactData)
            .select("id")
            .single();

          if (contactErr || !newContact) {
            console.error("Error creating contact from webhook lead:", contactErr);
            continue;
          }

          console.log(`Created contact ${newContact.id} from webhook lead ${leadgenId}`);

          // Create deal in first pipeline stage
          const { data: pipeline } = await supabase
            .from("pipelines")
            .select("id")
            .order("created_at", { ascending: true })
            .limit(1)
            .single();

          if (pipeline) {
            const { data: stage } = await supabase
              .from("pipeline_stages")
              .select("id")
              .eq("pipeline_id", pipeline.id)
              .order("order", { ascending: true })
              .limit(1)
              .single();

            if (stage) {
              await supabase.from("deals").insert({
                title: `Lead FB - ${contactData.full_name}`,
                contact_id: newContact.id,
                pipeline_id: pipeline.id,
                stage_id: stage.id,
                owner_id: userId,
                value: 0,
                currency: "USD",
                status: "open",
                source: "facebook",
              });
              console.log(`Created deal for contact ${newContact.id}`);
            }
          }
        }
      }

      // Meta requires 200 response within 20 seconds
      return new Response("OK", { status: 200 });
    } catch (e) {
      console.error("Webhook processing error:", e);
      // Always return 200 to prevent Meta from retrying
      return new Response("OK", { status: 200 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
