import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

function getExtFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "video/mp4": "mp4", "video/3gpp": "3gp",
    "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac",
    "audio/opus": "opus", "audio/webm": "webm",
    "application/pdf": "pdf",
  };
  const base = mimeType.split(";")[0].trim();
  return map[base] || base.split("/")[1] || "bin";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    // NOTE: supabase here uses the service role key — full access for all actions.

    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { action } = body;

    // Helper to get user's access token
    const getUserToken = async () => {
      const { data: config } = await supabase
        .from("whatsapp_configs")
        .select("access_token")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!config?.access_token) throw new Error("No token found. Please reconnect.");
      return config.access_token;
    };

    // ── UPLOAD MEDIA FOR SENDING (to Meta directly → media_id) ─────────────────
    // Used when sending template messages with IMAGE/VIDEO headers.
    // Uploads straight to Meta's media endpoint so Meta already has the file.
    if (action === "upload_template_media") {
      const { file_base64, mime_type, filename } = body;
      if (!file_base64 || !mime_type) throw new Error("file_base64 y mime_type son obligatorios");

      const { data: config } = await supabase
        .from("whatsapp_configs")
        .select("phone_number_id, access_token")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!config) throw new Error("WhatsApp no está configurado");

      // Decode base64 → binary
      const binaryStr = atob(file_base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      // Upload to Meta's media endpoint (simple, reliable, returns numeric media_id)
      const formData = new FormData();
      formData.append("messaging_product", "whatsapp");
      formData.append("type", mime_type);
      formData.append("file", new Blob([bytes], { type: mime_type }), filename || "media");

      const res = await fetch(`${GRAPH_API}/${config.phone_number_id}/media`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${config.access_token}` },
        body: formData,
      });
      const data = await res.json();
      console.log("upload_template_media response:", JSON.stringify(data));
      if (data.error) throw new Error(`Meta: ${data.error.message} (código ${data.error.code})`);

      return new Response(JSON.stringify({ media_id: data.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── MEDIA UPLOAD (Resumable Upload API → proper header_handle for templates) ──
    if (action === "upload_media") {
      const { file_base64, mime_type, filename } = body;
      if (!file_base64 || !mime_type) throw new Error("file_base64 y mime_type son obligatorios");

      const { data: config } = await supabase
        .from("whatsapp_configs")
        .select("phone_number_id, waba_id, access_token")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!config) throw new Error("WhatsApp no está configurado");

      // Decode base64 → binary
      const binaryStr = atob(file_base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      // Step 1: discover App ID via subscribed_apps on the WABA
      let appId: string | null = null;
      try {
        const appsRes = await fetch(`${GRAPH_API}/${config.waba_id}/subscribed_apps`, {
          headers: { "Authorization": `Bearer ${config.access_token}` },
        });
        const appsData = await appsRes.json();
        console.log("subscribed_apps:", JSON.stringify(appsData));
        appId = appsData.data?.[0]?.whatsapp_business_api_data?.id ?? null;
      } catch (_) { /* non-fatal, try /app below */ }

      // Fallback: GET /app (works when token is tied to a single app)
      if (!appId) {
        const appRes = await fetch(`${GRAPH_API}/app?fields=id`, {
          headers: { "Authorization": `Bearer ${config.access_token}` },
        });
        const appResData = await appRes.json();
        console.log("GET /app:", JSON.stringify(appResData));
        appId = appResData.id ?? null;
      }

      if (!appId) {
        throw new Error(
          "No se pudo obtener el App ID de Meta. Asegúrate de que la aplicación de Facebook esté " +
          "suscrita a tu WABA en Meta Business Manager (Configuración > WhatsApp Business Accounts > tu cuenta > Suscribir app)."
        );
      }

      // Step 2: Start a Resumable Upload session
      const cleanName = encodeURIComponent(filename || `upload.${mime_type.split("/")[1] || "bin"}`);
      const sessionRes = await fetch(
        `${GRAPH_API}/${appId}/uploads?file_name=${cleanName}&file_length=${bytes.length}&file_type=${encodeURIComponent(mime_type)}`,
        {
          method: "POST",
          headers: { "Authorization": `Bearer ${config.access_token}` },
        }
      );
      const sessionData = await sessionRes.json();
      console.log("Upload session:", JSON.stringify(sessionData));
      if (sessionData.error) {
        throw new Error(`Meta (sesión de subida): ${sessionData.error.message} (código ${sessionData.error.code})`);
      }
      const uploadSessionId = sessionData.id; // format: "upload:abc123"

      // Step 3: Upload the raw bytes to the session
      const uploadRes = await fetch(`${GRAPH_API}/${uploadSessionId}`, {
        method: "POST",
        headers: {
          "Authorization": `OAuth ${config.access_token}`,
          "file_offset": "0",
        },
        body: bytes,
      });
      const uploadData = await uploadRes.json();
      console.log("Upload result:", JSON.stringify(uploadData));
      if (uploadData.error) {
        throw new Error(`Meta (subida archivo): ${uploadData.error.message} (código ${uploadData.error.code})`);
      }

      // uploadData.h is the file handle (format "4:abc...") used as header_handle in templates
      const handle = uploadData.h;
      if (!handle) {
        throw new Error("Meta no devolvió un handle para el archivo. Respuesta: " + JSON.stringify(uploadData));
      }

      return new Response(JSON.stringify({ media_id: handle }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CHECK WHICH META APP THE TOKEN BELONGS TO ────────────────────────────
    // Returns { app_id, app_name, is_crm_app }
    // If is_crm_app = false the WABA is subscribed to a different app (e.g. a previous tool)
    // and incoming messages will NOT arrive in the CRM. User must reconnect via Embedded Signup.
    if (action === "check_webhook_app") {
      const CRM_APP_ID = Deno.env.get("META_APP_ID") || "1978595056421653";

      const { data: config } = await supabase
        .from("whatsapp_configs")
        .select("access_token")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!config?.access_token) throw new Error("WhatsApp no está configurado");

      const appRes = await fetch(`${GRAPH_API}/app?fields=id,name`, {
        headers: { "Authorization": `Bearer ${config.access_token}` },
      });
      const appData = await appRes.json();
      console.log("check_webhook_app:", JSON.stringify(appData));

      if (appData.error) {
        throw new Error(`Meta: ${appData.error.message}`);
      }

      return new Response(JSON.stringify({
        app_id: appData.id,
        app_name: appData.name,
        is_crm_app: appData.id === CRM_APP_ID,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SUBSCRIBE WABA TO APP (enables webhook delivery for incoming messages) ──
    if (action === "subscribe_waba") {
      const { data: config } = await supabase
        .from("whatsapp_configs")
        .select("waba_id, access_token")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!config) throw new Error("WhatsApp no está configurado");

      const res = await fetch(`${GRAPH_API}/${config.waba_id}/subscribed_apps`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${config.access_token}` },
      });
      const data = await res.json();
      console.log("subscribe_waba response:", JSON.stringify(data));
      if (data.error) throw new Error(`Meta: ${data.error.message} (código ${data.error.code})`);

      return new Response(JSON.stringify({ success: true, result: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_waba_accounts") {
      const accessToken = await getUserToken();
      const meRes = await fetch(`${GRAPH_API}/me/businesses?fields=id,name&access_token=${accessToken}`);
      const meData = await meRes.json();
      if (meData.error) throw new Error(meData.error.message);

      const wabaList: any[] = [];
      const seenIds = new Set<string>();

      for (const biz of (meData.data || [])) {
        // Check both owned WABAs and client WABAs (shared/managed accounts)
        const [ownedRes, clientRes] = await Promise.all([
          fetch(`${GRAPH_API}/${biz.id}/owned_whatsapp_business_accounts?fields=id,name,currency,timezone_id&access_token=${accessToken}`),
          fetch(`${GRAPH_API}/${biz.id}/client_whatsapp_business_accounts?fields=id,name,currency,timezone_id&access_token=${accessToken}`),
        ]);
        const [ownedData, clientData] = await Promise.all([ownedRes.json(), clientRes.json()]);

        for (const w of [...(ownedData.data || []), ...(clientData.data || [])]) {
          if (!seenIds.has(w.id)) {
            seenIds.add(w.id);
            wabaList.push({ ...w, business_name: biz.name });
          }
        }
      }

      return new Response(JSON.stringify({ waba_accounts: wabaList }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_phone_numbers") {
      const { waba_id } = body;
      const accessToken = await getUserToken();
      const res = await fetch(
        `${GRAPH_API}/${waba_id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status&access_token=${accessToken}`
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

      // Also update channels table
      const { data: config } = await supabase
        .from("whatsapp_configs")
        .select("access_token")
        .eq("user_id", user.id)
        .maybeSingle();

      await supabase.from("channels").upsert(
        {
          user_id: user.id,
          type: "whatsapp",
          provider: "meta",
          waba_id,
          phone_number_id,
          access_token: config?.access_token || "",
          display_phone: display_phone || null,
          business_name: business_name || null,
          is_active: true,
          status: "connected",
          connected_at: new Date().toISOString(),
        },
        { onConflict: "user_id,type,phone_number_id", ignoreDuplicates: false }
      );

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "save_manual_config") {
      const { phone_number_id, waba_id, access_token, display_phone, business_name } = body;
      if (!phone_number_id || !waba_id || !access_token) {
        throw new Error("phone_number_id, waba_id y access_token son obligatorios");
      }

      // Validate token using /me (works with both temp and permanent tokens)
      const testRes = await fetch(`${GRAPH_API}/me?access_token=${access_token}`);
      const testData = await testRes.json();
      if (testData.error) {
        throw new Error("Token inválido: " + testData.error.message);
      }

      // Try to get phone number details (non-fatal if it fails for test numbers)
      let resolvedPhone = display_phone || null;
      let resolvedName = business_name || null;
      try {
        const phoneRes = await fetch(`${GRAPH_API}/${phone_number_id}?fields=display_phone_number,verified_name&access_token=${access_token}`);
        const phoneData = await phoneRes.json();
        if (!phoneData.error) {
          resolvedPhone = phoneData.display_phone_number || resolvedPhone;
          resolvedName = phoneData.verified_name || resolvedName;
        }
      } catch (_) { /* non-fatal */ }

      const { error } = await supabase.from("whatsapp_configs").upsert(
        {
          user_id: user.id,
          access_token,
          phone_number_id,
          waba_id,
          display_phone: resolvedPhone,
          business_name: resolvedName,
          is_active: true,
          webhook_verified: false,
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;

      // Also save to channels
      await supabase.from("channels").upsert(
        {
          user_id: user.id,
          type: "whatsapp",
          provider: "meta",
          waba_id,
          phone_number_id,
          access_token,
          display_phone: resolvedPhone,
          business_name: resolvedName,
          is_active: true,
          status: "connected",
          connected_at: new Date().toISOString(),
        },
        { onConflict: "user_id,type,phone_number_id", ignoreDuplicates: false }
      );

      // Subscribe this app to receive webhooks for this WABA (enables incoming messages)
      try {
        const subRes = await fetch(`${GRAPH_API}/${waba_id}/subscribed_apps`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${access_token}` },
        });
        const subData = await subRes.json();
        console.log("WABA webhook subscription:", JSON.stringify(subData));
      } catch (_) { /* non-fatal — user can trigger manually */ }

      return new Response(JSON.stringify({
        success: true,
        display_phone: resolvedPhone,
        business_name: resolvedName,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disconnect") {
      await supabase
        .from("whatsapp_configs")
        .update({ is_active: false })
        .eq("user_id", user.id);

      // Also deactivate in channels
      await supabase
        .from("channels")
        .update({ is_active: false, status: "disconnected" })
        .eq("user_id", user.id)
        .eq("type", "whatsapp");

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── TEMPLATES ────────────────────────────────────────────────────────────

    if (action === "list_templates") {
      const { data: config } = await supabase
        .from("whatsapp_configs")
        .select("waba_id, access_token, phone_number_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!config) throw new Error("WhatsApp no está configurado");

      console.log("Fetching templates for WABA:", config.waba_id);
      const res = await fetch(
        `${GRAPH_API}/${config.waba_id}/message_templates?fields=id,name,status,category,language,components,rejected_reason,quality_score&limit=100&access_token=${config.access_token}`
      );
      const data = await res.json();
      console.log("Meta list_templates response:", JSON.stringify(data).substring(0, 500));
      if (data.error) throw new Error(`Meta error ${data.error.code}: ${data.error.message}`);

      // Sync to local DB
      const templates = data.data || [];
      for (const t of templates) {
        const header = t.components?.find((c: any) => c.type === "HEADER");
        const bodyComp = t.components?.find((c: any) => c.type === "BODY");
        const footer = t.components?.find((c: any) => c.type === "FOOTER");
        const buttons = t.components?.find((c: any) => c.type === "BUTTONS");

        // Extract the approved media handle. Meta may return either:
        //   - A permanent media handle/ID (e.g. "4:AbCd…")
        //   - A temporary CDN URL  (e.g. "https://scontent.whatsapp.net/…")
        // CDN URLs expire and cannot be used reliably as `link` in send calls.
        // When we detect a CDN URL we re-upload the media to the WhatsApp Media API
        // to obtain a permanent media ID that we store instead.
        let headerMediaHandle: string | null =
          header?.example?.header_handle?.[0] ?? null;

        if (
          headerMediaHandle &&
          headerMediaHandle.startsWith("http") &&
          config.phone_number_id
        ) {
          try {
            const imgRes = await fetch(headerMediaHandle);
            if (imgRes.ok) {
              const imgBlob = await imgRes.blob();
              const contentType =
                imgRes.headers.get("content-type") || "image/jpeg";

              const formData = new FormData();
              formData.append("messaging_product", "whatsapp");
              formData.append(
                "file",
                new File([imgBlob], "header_media", { type: contentType }),
                "header_media"
              );
              formData.append("type", contentType);

              const uploadRes = await fetch(
                `${GRAPH_API}/${config.phone_number_id}/media`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${config.access_token}`,
                  },
                  body: formData,
                }
              );
              const uploadData = await uploadRes.json();
              if (uploadData.id) {
                console.log(
                  `Re-uploaded header media for template "${t.name}": ${uploadData.id}`
                );
                headerMediaHandle = uploadData.id;
              } else {
                console.warn(
                  `Could not re-upload media for "${t.name}", keeping CDN URL:`,
                  JSON.stringify(uploadData).substring(0, 200)
                );
                // Keep CDN URL as fallback — better than nothing
              }
            }
          } catch (uploadErr) {
            console.warn(
              `Error re-uploading media for template "${t.name}":`,
              uploadErr
            );
            // Keep CDN URL as fallback
          }
        }

        await supabase.from("whatsapp_templates").upsert({
          user_id: user.id,
          waba_id: config.waba_id,
          template_id: t.id,
          name: t.name,
          category: t.category,
          language: t.language,
          status: t.status,
          rejection_reason: (t.rejected_reason && t.rejected_reason !== "NONE") ? t.rejected_reason : null,
          header_type: header?.format || null,
          header_text: header?.text || null,
          header_media_handle: headerMediaHandle,
          body_text: bodyComp?.text || "",
          footer_text: footer?.text || null,
          buttons: buttons?.buttons || [],
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,name,language" });
      }

      return new Response(JSON.stringify({ templates }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create_template") {
      const { name, category, language, header, body_text, footer, buttons, variable_examples } = body;
      if (!name || !category || !language || !body_text) {
        throw new Error("name, category, language y body_text son obligatorios");
      }

      const { data: config } = await supabase
        .from("whatsapp_configs")
        .select("waba_id, access_token")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!config) throw new Error("WhatsApp no está configurado");

      // Validate media headers have an uploaded file
      if (["IMAGE", "VIDEO", "DOCUMENT"].includes(header?.type) && !header?.media_id) {
        throw new Error(
          `Para encabezados de tipo ${header?.type} debes subir un archivo primero. ` +
          `Haz clic en el área de carga para adjuntar tu ${header?.type === "IMAGE" ? "imagen" : header?.type === "VIDEO" ? "video" : "documento"}.`
        );
      }

      // Build components
      const components: any[] = [];

      // HEADER component
      if (header?.type === "TEXT" && header?.text) {
        const headerComp: any = { type: "HEADER", format: "TEXT", text: header.text };
        // Add example if header has variables
        if (header.text.includes("{{")) {
          headerComp.example = { header_text: [header.text.replace(/\{\{\d+\}\}/g, "Ejemplo")] };
        }
        components.push(headerComp);
      } else if (header?.type === "IMAGE") {
        const imgComp: any = { type: "HEADER", format: "IMAGE" };
        // header.media_id = uploaded media handle from Meta; header.text = fallback URL
        if (header?.media_id) imgComp.example = { header_handle: [header.media_id] };
        components.push(imgComp);
      } else if (header?.type === "VIDEO") {
        const vidComp: any = { type: "HEADER", format: "VIDEO" };
        if (header?.media_id) vidComp.example = { header_handle: [header.media_id] };
        components.push(vidComp);
      } else if (header?.type === "DOCUMENT") {
        const docComp: any = { type: "HEADER", format: "DOCUMENT" };
        if (header?.media_id) docComp.example = { header_handle: [header.media_id] };
        components.push(docComp);
      }

      // BODY component — extract unique sorted variables and build examples
      const bodyComp: any = { type: "BODY", text: body_text };
      const allVarMatches = body_text.match(/\{\{(\d+)\}\}/g) || [];
      const uniqueVarNums = [...new Set(allVarMatches.map(m => parseInt(m.replace(/[{}]/g, ""))))].sort((a, b) => a - b);
      if (uniqueVarNums.length > 0) {
        const exampleValues = uniqueVarNums.map((_, i) =>
          (variable_examples && variable_examples[i]) ? String(variable_examples[i]) : `Ejemplo${i + 1}`
        );
        bodyComp.example = { body_text: [exampleValues] };
      }
      components.push(bodyComp);

      // FOOTER component
      if (footer) {
        components.push({ type: "FOOTER", text: footer });
      }

      // BUTTONS component — normalize structure
      if (buttons?.length > 0) {
        const normalizedButtons = buttons.map((btn: any) => {
          if (btn.type === "QUICK_REPLY") {
            return { type: "QUICK_REPLY", text: btn.text };
          } else if (btn.type === "URL") {
            return { type: "URL", text: btn.text, url: btn.url || "https://example.com" };
          } else if (btn.type === "PHONE_NUMBER") {
            return { type: "PHONE_NUMBER", text: btn.text, phone_number: btn.phone_number || "+1234567890" };
          }
          return btn;
        });
        components.push({ type: "BUTTONS", buttons: normalizedButtons });
      }

      const payload = { name, category, language, components };
      console.log("Sending to Meta:", JSON.stringify(payload));

      const res = await fetch(`${GRAPH_API}/${config.waba_id}/message_templates`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      console.log("Meta response:", JSON.stringify(data));
      console.log("Payload sent:", JSON.stringify(payload));

      if (data.error) {
        const errDetail = data.error.error_data?.details || data.error.error_user_msg || "";
        const fullMsg = `Meta: ${data.error.message}${errDetail ? " — " + errDetail : ""} (código ${data.error.code})`;
        console.error("Meta create_template error:", fullMsg, JSON.stringify(data.error));
        // Save to local DB as DRAFT so the user can see it failed
        await supabase.from("whatsapp_templates").upsert({
          user_id: user.id,
          waba_id: config.waba_id,
          name,
          category,
          language,
          status: "DRAFT",
          rejection_reason: fullMsg,
          header_type: header?.type || null,
          header_text: header?.text || null,
          body_text,
          footer_text: footer || null,
          buttons: buttons || [],
        }, { onConflict: "user_id,name,language" });
        throw new Error(fullMsg);
      }

      // Save to local DB
      await supabase.from("whatsapp_templates").upsert({
        user_id: user.id,
        waba_id: config.waba_id,
        template_id: data.id || null,
        name,
        category,
        language,
        status: data.status || "PENDING",
        header_type: header?.type || null,
        header_text: header?.text || null,
        body_text,
        footer_text: footer || null,
        buttons: buttons || [],
      }, { onConflict: "user_id,name,language" });

      return new Response(JSON.stringify({ success: true, template_id: data.id, status: data.status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_template") {
      const { name } = body;
      if (!name) throw new Error("name es obligatorio");

      // Check if template exists in Meta (has a template_id)
      const { data: tmpl } = await supabase
        .from("whatsapp_templates")
        .select("template_id, status")
        .eq("user_id", user.id)
        .eq("name", name)
        .maybeSingle();

      // Only call Meta API if template was actually created there (not a DRAFT)
      if (tmpl?.template_id && tmpl?.status !== "DRAFT") {
        const { data: config } = await supabase
          .from("whatsapp_configs")
          .select("waba_id, access_token")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle();

        if (config) {
          const res = await fetch(
            `${GRAPH_API}/${config.waba_id}/message_templates?name=${encodeURIComponent(name)}`,
            {
              method: "DELETE",
              headers: { "Authorization": `Bearer ${config.access_token}` },
            }
          );
          const data = await res.json();
          if (data.error) console.warn("Meta delete warning:", data.error.message);
        }
      }

      // Always remove from local DB
      await supabase.from("whatsapp_templates")
        .delete()
        .eq("user_id", user.id)
        .eq("name", name);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_template") {
      const { template_id, name, header, body_text, footer, buttons, variable_examples } = body;
      if (!template_id || !body_text) throw new Error("template_id y body_text son obligatorios");

      const { data: config } = await supabase
        .from("whatsapp_configs")
        .select("waba_id, access_token")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!config) throw new Error("WhatsApp no está configurado");

      // Validate media headers have an uploaded file
      if (["IMAGE", "VIDEO", "DOCUMENT"].includes(header?.type) && !header?.media_id) {
        throw new Error(
          `Para encabezados de tipo ${header?.type} debes subir un archivo de muestra antes de guardar.`
        );
      }

      // Build components (same logic as create)
      const components: any[] = [];

      if (header?.type === "TEXT" && header?.text) {
        const headerComp: any = { type: "HEADER", format: "TEXT", text: header.text };
        if (header.text.includes("{{")) {
          headerComp.example = { header_text: [header.text.replace(/\{\{\d+\}\}/g, "Ejemplo")] };
        }
        components.push(headerComp);
      } else if (header?.type === "IMAGE") {
        const imgComp: any = { type: "HEADER", format: "IMAGE" };
        if (header?.media_id) imgComp.example = { header_handle: [header.media_id] };
        components.push(imgComp);
      } else if (header?.type === "VIDEO") {
        const vidComp: any = { type: "HEADER", format: "VIDEO" };
        if (header?.media_id) vidComp.example = { header_handle: [header.media_id] };
        components.push(vidComp);
      }

      const bodyComp: any = { type: "BODY", text: body_text };
      const allVarMatchesUpd = body_text.match(/\{\{(\d+)\}\}/g) || [];
      const uniqueVarNumsUpd = [...new Set(allVarMatchesUpd.map((m: string) => parseInt(m.replace(/[{}]/g, ""))))].sort((a: number, b: number) => a - b);
      if (uniqueVarNumsUpd.length > 0) {
        const exampleValues = uniqueVarNumsUpd.map((_: number, i: number) =>
          (variable_examples && variable_examples[i]) ? String(variable_examples[i]) : `Ejemplo${i + 1}`
        );
        bodyComp.example = { body_text: [exampleValues] };
      }
      components.push(bodyComp);

      if (footer) components.push({ type: "FOOTER", text: footer });

      if (buttons?.length > 0) {
        const normalizedButtons = buttons.map((btn: any) => {
          if (btn.type === "QUICK_REPLY") return { type: "QUICK_REPLY", text: btn.text };
          if (btn.type === "URL") return { type: "URL", text: btn.text, url: btn.url || "https://example.com" };
          if (btn.type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: btn.text, phone_number: btn.phone_number || "+1234567890" };
          return btn;
        });
        components.push({ type: "BUTTONS", buttons: normalizedButtons });
      }

      const res = await fetch(`${GRAPH_API}/${template_id}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${config.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ components }),
      });
      const data = await res.json();
      console.log("Meta update_template response:", JSON.stringify(data));
      if (data.error) throw new Error(`Meta: ${data.error.message} (código ${data.error.code})`);

      // Update local DB
      const headerComp2 = components.find((c: any) => c.type === "HEADER");
      const footerComp = components.find((c: any) => c.type === "FOOTER");
      const buttonsComp = components.find((c: any) => c.type === "BUTTONS");

      await supabase.from("whatsapp_templates")
        .update({
          status: "PENDING",
          header_type: headerComp2?.format || null,
          header_text: headerComp2?.text || null,
          body_text,
          footer_text: footerComp?.text || null,
          buttons: buttonsComp?.buttons || [],
          rejection_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .eq("name", name);

      return new Response(JSON.stringify({ success: true, status: "PENDING" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SEND TEMPLATE MESSAGE ────────────────────────────────────────────────
    if (action === "send_template") {
      const { phone, template_name, language, variables, header_media_url, header_media_id, contact_id } = body;
      if (!phone || !template_name) throw new Error("phone y template_name son obligatorios");

      const { data: config } = await supabase
        .from("whatsapp_configs")
        .select("phone_number_id, access_token")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!config) throw new Error("WhatsApp no está configurado");

      // Look up template in local DB to know header type and body text
      const { data: tpl } = await supabase
        .from("whatsapp_templates")
        .select("header_type, header_text, body_text")
        .eq("user_id", user.id)
        .eq("name", template_name)
        .maybeSingle();

      // Build components matching what the template was approved with
      const components: any[] = [];

      // HEADER component (required if template has IMAGE/VIDEO/DOCUMENT header)
      const headerType = tpl?.header_type || null;
      if (headerType === "IMAGE" || headerType === "VIDEO" || headerType === "DOCUMENT") {
        const mediaParam: any = { type: headerType.toLowerCase() };
        if (header_media_id) {
          mediaParam[headerType.toLowerCase()] = { id: header_media_id };
        } else if (header_media_url) {
          mediaParam[headerType.toLowerCase()] = { link: header_media_url };
        } else {
          throw new Error(
            `Esta plantilla tiene un encabezado de ${headerType.toLowerCase()}. ` +
            `Debes proporcionar una URL pública de la imagen/video para enviarlo.`
          );
        }
        components.push({ type: "header", parameters: [mediaParam] });
      }

      // BODY component with text variables
      if (variables && (variables as string[]).length > 0) {
        components.push({
          type: "body",
          parameters: (variables as string[]).map((v) => ({ type: "text", text: v || " " })),
        });
      }

      const payload: any = {
        messaging_product: "whatsapp",
        to: phone.replace(/[^0-9]/g, ""),
        type: "template",
        template: {
          name: template_name,
          language: { code: language || "es" },
        },
      };
      if (components.length > 0) payload.template.components = components;

      console.log("send_template payload:", JSON.stringify(payload));
      const res = await fetch(`${GRAPH_API}/${config.phone_number_id}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      console.log("send_template response:", JSON.stringify(data));
      if (data.error) {
        throw new Error(`Meta: ${data.error.message} (código ${data.error.code})`);
      }

      const waMessageId = data.messages?.[0]?.id;

      // Render template body with actual variable values for display
      let renderedBody = tpl?.body_text || `[Plantilla: ${template_name}]`;
      if (variables && (variables as string[]).length > 0) {
        (variables as string[]).forEach((val, i) => {
          renderedBody = renderedBody.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, "g"), val || `{{${i + 1}}}`);
        });
      }

      // Save to messages DB
      await supabase.from("whatsapp_messages").insert({
        user_id: user.id,
        contact_id: contact_id || null,
        wa_message_id: waMessageId,
        phone_number: phone.replace(/[^0-9]/g, ""),
        direction: "outgoing",
        message_type: "template",
        message_text: renderedBody,
        status: "sent",
      });

      if (contact_id) {
        await supabase.from("activities").insert({
          related_entity_type: "contact",
          related_entity_id: contact_id,
          event_type: "whatsapp",
          event_source: "whatsapp_cloud_api",
          summary: `Plantilla WhatsApp enviada: ${template_name}`,
          created_by: user.id,
        });
      }

      return new Response(JSON.stringify({ success: true, message_id: waMessageId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── FETCH MEDIA ON-DEMAND (retry after webhook failure) ──────────────────
    // Called when a message has media_url = "meta:{media_id}" (download failed in webhook)
    if (action === "fetch_media") {
      const { wa_media_id, message_id } = body;
      if (!wa_media_id) throw new Error("wa_media_id es obligatorio");

      const { data: config } = await supabase
        .from("whatsapp_configs")
        .select("access_token")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!config?.access_token) throw new Error("WhatsApp no está configurado o token inválido");

      // Step 1: get download URL from Meta
      const metaRes = await fetch(`${GRAPH_API}/${wa_media_id}`, {
        headers: { "Authorization": `Bearer ${config.access_token}` },
      });
      const metaInfo = await metaRes.json();
      console.log("fetch_media meta info:", JSON.stringify(metaInfo).substring(0, 300));
      if (metaInfo.error) {
        throw new Error(`Meta: ${metaInfo.error.message} (código ${metaInfo.error.code}) — el token podría estar vencido`);
      }
      if (!metaInfo.url) throw new Error("Meta no devolvió URL de descarga");

      // Step 2: download the file
      const fileRes = await fetch(metaInfo.url, {
        headers: { "Authorization": `Bearer ${config.access_token}` },
      });
      if (!fileRes.ok) throw new Error(`Descarga fallida: HTTP ${fileRes.status}`);
      const fileBuffer = await fileRes.arrayBuffer();

      // Step 3: determine mime type and upload to Supabase Storage
      const mimeType = (metaInfo.mime_type || "application/octet-stream").split(";")[0].trim();
      const ext = getExtFromMime(mimeType);
      const storagePath = `${user.id}/${Date.now()}_${wa_media_id}.${ext}`;
      const blob = new Blob([fileBuffer], { type: mimeType });

      const { error: storageErr } = await supabase.storage
        .from("whatsapp-media")
        .upload(storagePath, blob, { contentType: mimeType, upsert: false });
      if (storageErr) throw new Error(`Storage: ${storageErr.message}`);

      const { data: pubData } = supabase.storage.from("whatsapp-media").getPublicUrl(storagePath);
      const mediaUrl = pubData.publicUrl;

      // Step 4: update the message record if message_id provided
      if (message_id) {
        await supabase
          .from("whatsapp_messages")
          .update({ media_url: mediaUrl })
          .eq("id", message_id)
          .eq("user_id", user.id);
      }

      return new Response(JSON.stringify({ media_url: mediaUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SEND MEDIA MESSAGE ───────────────────────────────────────────────────
    if (action === "send_media") {
      const { phone, file_base64, mime_type, filename, contact_id, caption } = body;
      if (!phone || !file_base64 || !mime_type) {
        throw new Error("phone, file_base64 y mime_type son obligatorios");
      }

      const { data: config } = await supabase
        .from("whatsapp_configs")
        .select("phone_number_id, access_token")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!config) throw new Error("WhatsApp no está configurado");

      // Decode base64 → Uint8Array
      const binaryStr = atob(file_base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      const mimeBase = mime_type.split(";")[0].trim();
      const ext = getExtFromMime(mimeBase);
      const safeFilename = filename || `media.${ext}`;

      // 1. Upload to Supabase Storage for permanent display URL
      let mediaUrl: string | null = null;
      try {
        const storagePath = `${user.id}/${Date.now()}_${safeFilename}`;
        const uploadBlob = new Blob([bytes], { type: mimeBase });
        const { error: storageErr } = await supabase.storage
          .from("whatsapp-media")
          .upload(storagePath, uploadBlob, { contentType: mimeBase, upsert: false });
        if (!storageErr) {
          const { data: pubData } = supabase.storage.from("whatsapp-media").getPublicUrl(storagePath);
          mediaUrl = pubData.publicUrl;
        } else {
          console.warn("Storage upload error (non-fatal):", storageErr.message);
        }
      } catch (e) {
        console.warn("Storage upload failed (non-fatal):", e);
      }

      // 2. Upload to Meta media endpoint → get media_id
      const formData = new FormData();
      formData.append("messaging_product", "whatsapp");
      formData.append("type", mimeBase);
      formData.append("file", new Blob([bytes], { type: mimeBase }), safeFilename);

      const uploadRes = await fetch(`${GRAPH_API}/${config.phone_number_id}/media`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${config.access_token}` },
        body: formData,
      });
      const uploadData = await uploadRes.json();
      console.log("send_media upload response:", JSON.stringify(uploadData));
      if (uploadData.error) throw new Error(`Meta: ${uploadData.error.message} (código ${uploadData.error.code})`);
      const metaMediaId = uploadData.id;

      // 3. Determine message type
      let msgType: string;
      if (mimeBase.startsWith("image/")) msgType = "image";
      else if (mimeBase.startsWith("video/")) msgType = "video";
      else if (mimeBase.startsWith("audio/")) msgType = "audio";
      else msgType = "document";

      // 4. Build and send the WhatsApp message
      const mediaObj: any = { id: metaMediaId };
      if (caption && (msgType === "image" || msgType === "video" || msgType === "document")) {
        mediaObj.caption = caption;
      }
      if (msgType === "document") {
        mediaObj.filename = safeFilename;
      }

      const msgPayload = {
        messaging_product: "whatsapp",
        to: phone.replace(/[^0-9]/g, ""),
        type: msgType,
        [msgType]: mediaObj,
      };
      console.log("send_media payload:", JSON.stringify(msgPayload));

      const res = await fetch(`${GRAPH_API}/${config.phone_number_id}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(msgPayload),
      });
      const data = await res.json();
      console.log("send_media response:", JSON.stringify(data));
      if (data.error) throw new Error(`Meta: ${data.error.message} (código ${data.error.code})`);

      const waMessageId = data.messages?.[0]?.id;

      // 5. Save to DB
      await supabase.from("whatsapp_messages").insert({
        user_id: user.id,
        contact_id: contact_id || null,
        wa_message_id: waMessageId,
        phone_number: phone.replace(/[^0-9]/g, ""),
        direction: "outgoing",
        message_type: msgType,
        message_text: caption || null,
        media_url: mediaUrl,
        status: "sent",
      });

      if (contact_id) {
        await supabase.from("activities").insert({
          related_entity_type: "contact",
          related_entity_id: contact_id,
          event_type: "whatsapp",
          event_source: "whatsapp_cloud_api",
          summary: `WhatsApp ${msgType} enviado`,
          created_by: user.id,
        });
      }

      return new Response(JSON.stringify({ success: true, message_id: waMessageId, media_url: mediaUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error: any) {
    console.error("whatsapp-api error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
