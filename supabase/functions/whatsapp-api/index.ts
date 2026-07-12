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

    // Helper to get user's access token — prefers pending row (fresh OAuth), then any active row
    // Multi-org safety: when the frontend didn't pass organization_id, derive it
    // when unambiguous (user belongs to exactly one org). If the user belongs to
    // SEVERAL orgs, an unscoped user_id lookup could pick another org's WhatsApp
    // config (wrong sender number), so we keep orgId null only for single-org
    // legacy rows and never mix configs across orgs for multi-org users.
    let orgId: string | null = body?.organization_id ?? null;
    if (!orgId) {
      const { data: myOrgs } = await supabase
        .from("organization_members").select("organization_id").eq("user_id", user.id);
      const ids = [...new Set((myOrgs || []).map((m: any) => m.organization_id).filter(Boolean))];
      if (ids.length === 1) orgId = ids[0] as string;
      else if (ids.length > 1) {
        // Ambiguous: refuse to guess for config-sensitive actions.
        const CONFIG_SENSITIVE = ["send_template", "send_media", "upload_media", "upload_template_media", "create_template", "delete_template", "update_template", "check_webhook_app", "register_phone"];
        if (CONFIG_SENSITIVE.includes(action)) {
          throw new Error("organization_id es obligatorio para esta acción (usuario multi-organización).");
        }
      }
    }
    const getUserToken = async () => {
      // 1. Look for pending row (just created by OAuth) — MUST be scoped by org
      //    so that a user admin of multiple orgs gets the token for THIS org, not another.
      let pendingQ = supabase
        .from("whatsapp_configs")
        .select("access_token")
        .eq("user_id", user.id)
        .eq("phone_number_id", "pending")
        .order("created_at", { ascending: false })
        .limit(1);
      if (orgId) pendingQ = pendingQ.eq("organization_id", orgId);
      const { data: pending } = await pendingQ.maybeSingle();
      if (pending?.access_token) return pending.access_token;

      // 2. Fall back to any active row for this org
      let activeQ = supabase
        .from("whatsapp_configs")
        .select("access_token")
        .eq("user_id", user.id)
        .neq("phone_number_id", "pending")
        .order("created_at", { ascending: false })
        .limit(1);
      if (orgId) activeQ = activeQ.eq("organization_id", orgId);
      const { data: active } = await activeQ.maybeSingle();
      if (!active?.access_token) throw new Error("No token found. Please reconnect.");
      return active.access_token;
    };

    // ── UPLOAD MEDIA FOR SENDING (to Meta directly → media_id) ─────────────────
    // Used when sending template messages with IMAGE/VIDEO headers.
    // Uploads straight to Meta's media endpoint so Meta already has the file.
    if (action === "upload_template_media") {
      const { file_base64, mime_type, filename } = body;
      if (!file_base64 || !mime_type) throw new Error("file_base64 y mime_type son obligatorios");

      let utmQ = supabase
        .from("whatsapp_configs")
        .select("phone_number_id, access_token")
        .eq("user_id", user.id)
        .eq("is_active", true);
      if (orgId) utmQ = utmQ.eq("organization_id", orgId);
      const { data: config } = await utmQ.maybeSingle();
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

      let umQ = supabase
        .from("whatsapp_configs")
        .select("phone_number_id, waba_id, access_token")
        .eq("user_id", user.id)
        .eq("is_active", true);
      if (orgId) umQ = umQ.eq("organization_id", orgId);
      const { data: config } = await umQ.maybeSingle();
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
      const CRM_APP_SECRET = Deno.env.get("META_APP_SECRET") || "";

      let cwaQ = supabase
        .from("whatsapp_configs")
        .select("access_token")
        .eq("user_id", user.id)
        .eq("is_active", true);
      if (orgId) cwaQ = cwaQ.eq("organization_id", orgId);
      const { data: config } = await cwaQ.maybeSingle();
      if (!config?.access_token) throw new Error("WhatsApp no está configurado");

      const appRes = await fetch(`${GRAPH_API}/app?fields=id,name`, {
        headers: { "Authorization": `Bearer ${config.access_token}` },
      });
      const appData = await appRes.json();
      console.log("check_webhook_app:", JSON.stringify(appData));

      if (appData.error) {
        throw new Error(`Meta: ${appData.error.message}`);
      }

      // Also check webhook subscriptions using app token (id|secret)
      let webhookSubscriptions: any[] = [];
      let webhookError: string | null = null;
      if (CRM_APP_SECRET) {
        const appToken = `${CRM_APP_ID}|${CRM_APP_SECRET}`;
        const subsRes = await fetch(`${GRAPH_API}/${CRM_APP_ID}/subscriptions?access_token=${appToken}`);
        const subsData = await subsRes.json();
        console.log("webhook_subscriptions:", JSON.stringify(subsData));
        if (subsData.data) {
          webhookSubscriptions = subsData.data;
        } else if (subsData.error) {
          webhookError = subsData.error.message;
        }
      }

      return new Response(JSON.stringify({
        app_id: appData.id,
        app_name: appData.name,
        is_crm_app: appData.id === CRM_APP_ID,
        webhook_subscriptions: webhookSubscriptions,
        webhook_error: webhookError,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── REGISTER PHONE NUMBER IN CLOUD API ──────────────────────────────────
    // Activates a newly-added phone number so it can send/receive messages.
    // Meta's WhatsApp Manager UI cannot do this — it must be done via the
    // /register API endpoint with a 6-digit PIN.  The PIN doubles as the
    // two-step verification PIN for future re-registrations.
    // ── VERIFY REGISTRATION (auto-heal) ─────────────────────────────────────
    // Checks each unverified config against Meta: if the phone number is already
    // CONNECTED on Cloud API (e.g. after a reconnection), mark webhook_verified
    // so the "pending activation" banner doesn't show a false positive.
    if (action === "verify_registration") {
      let vrQ = supabase
        .from("whatsapp_configs")
        .select("id, phone_number_id, access_token")
        .eq("is_active", true)
        .eq("webhook_verified", false)
        .neq("phone_number_id", "pending");
      if (orgId) vrQ = vrQ.eq("organization_id", orgId);
      else vrQ = vrQ.eq("user_id", user.id);
      const { data: unverified } = await vrQ;

      let healed = 0;
      for (const cfg of (unverified || [])) {
        try {
          const r = await fetch(
            `${GRAPH_API}/${cfg.phone_number_id}?fields=status,platform_type,code_verification_status&access_token=${encodeURIComponent(cfg.access_token)}`,
          );
          const info = await r.json();
          if (info?.status === "CONNECTED") {
            await supabase.from("whatsapp_configs").update({ webhook_verified: true }).eq("id", cfg.id);
            healed++;
          }
        } catch (_) { /* leave unverified */ }
      }
      return new Response(JSON.stringify({ success: true, healed, checked: unverified?.length ?? 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "register_phone") {
      const { pin } = body;
      if (!pin || !/^\d{6}$/.test(String(pin))) {
        throw new Error("El PIN debe ser de exactamente 6 dígitos numéricos");
      }

      // Query by org_id first (multi-user orgs); fall back to user_id for solo workspaces
      let rpQ = supabase
        .from("whatsapp_configs")
        .select("phone_number_id, access_token")
        .eq("is_active", true);
      if (orgId) {
        rpQ = rpQ.eq("organization_id", orgId);
      } else {
        rpQ = rpQ.eq("user_id", user.id);
      }
      const { data: config } = await rpQ.maybeSingle();
      if (!config?.phone_number_id || !config?.access_token) {
        throw new Error("WhatsApp no está configurado. Conecta primero.");
      }
      if (config.phone_number_id === "pending") {
        throw new Error("Selecciona un número primero antes de activarlo.");
      }

      const res = await fetch(`${GRAPH_API}/${config.phone_number_id}/register`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          pin: String(pin),
        }),
      });
      const data = await res.json();
      console.log("register_phone response:", JSON.stringify(data));

      if (data.error) {
        const code = data.error.code;
        const msg = data.error.message || "Error desconocido";
        // Code 133005 = "Invalid Verification Code" (PIN ya configurado antes con otro valor)
        // Code 133006 = "Re-registration needs to be initiated by client"
        // Code 133008 = "Too many attempts"
        throw new Error(`Meta: ${msg} (código ${code})`);
      }

      // Mark number as registered so the UI can detect unregistered numbers
      let regUpdateQ = supabase
        .from("whatsapp_configs")
        .update({ webhook_verified: true })
        .eq("is_active", true);
      if (orgId) {
        regUpdateQ = regUpdateQ.eq("organization_id", orgId);
      } else {
        regUpdateQ = regUpdateQ.eq("user_id", user.id);
      }
      await regUpdateQ;

      // Auto-subscribe WABA to webhook after registration so incoming messages work
      // without any manual step from the user.
      try {
        const { data: wabaConfig } = await supabase
          .from("whatsapp_configs")
          .select("waba_id, access_token")
          .eq("is_active", true)
          .eq(orgId ? "organization_id" : "user_id", orgId ?? user.id)
          .maybeSingle();
        if (wabaConfig?.waba_id && wabaConfig?.access_token) {
          const subRes = await fetch(`${GRAPH_API}/${wabaConfig.waba_id}/subscribed_apps`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${wabaConfig.access_token}` },
          });
          const subData = await subRes.json();
          console.log("Auto subscribe_waba after register:", JSON.stringify(subData));
        }
      } catch (subErr) {
        console.warn("Auto subscribe_waba failed (non-fatal):", subErr);
      }

      return new Response(JSON.stringify({ success: true, result: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SUBSCRIBE WABA TO APP (enables webhook delivery for incoming messages) ──
    if (action === "subscribe_waba") {
      const META_APP_ID = Deno.env.get("META_APP_ID");
      const META_APP_SECRET = Deno.env.get("META_APP_SECRET");

      // Find active config, scoped by org when provided
      let wabaQ = supabase
        .from("whatsapp_configs")
        .select("waba_id, access_token")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);
      if (orgId) {
        wabaQ = wabaQ.eq("organization_id", orgId);
      } else {
        wabaQ = wabaQ.eq("user_id", user.id);
      }
      const { data: config } = await wabaQ.maybeSingle();
      if (!config) throw new Error("WhatsApp no está configurado");

      // Always use the customer's own access token to subscribe their WABA.
      // The App Access Token (APP_ID|APP_SECRET) only works for Klosify's own
      // system-user WABAs — for customer WABAs connected via OAuth, only their
      // user token (with whatsapp_business_management permission) has access.
      const authToken = config.access_token;

      const res = await fetch(`${GRAPH_API}/${config.waba_id}/subscribed_apps`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${authToken}` },
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

      const wabaList: any[] = [];
      const seenIds = new Set<string>();

      // Paginate through ALL businesses — admins with 50+ managed accounts need this
      let nextBizUrl: string | null = `${GRAPH_API}/me/businesses?fields=id,name&limit=25&access_token=${accessToken}`;
      const MAX_PAGES = 10;
      let pageCount = 0;

      while (nextBizUrl && pageCount < MAX_PAGES) {
        pageCount++;
        const bizRes = await fetch(nextBizUrl);
        const bizData = await bizRes.json();
        if (bizData.error) throw new Error(bizData.error.message);
        nextBizUrl = bizData.paging?.next || null;

        for (const biz of (bizData.data || [])) {
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
      }

      console.log(`get_waba_accounts: scanned ${pageCount} page(s), found ${wabaList.length} WABAs`);
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

      // Find the pending row — filter by organization_id when provided (multi-org fix)
      const orgId: string | null = body.organization_id ?? null;
      let pendingQuery = supabase
        .from("whatsapp_configs")
        .select("id, access_token")
        .eq("user_id", user.id)
        .eq("phone_number_id", "pending")
        .order("created_at", { ascending: false })
        .limit(1);
      if (orgId) pendingQuery = pendingQuery.eq("organization_id", orgId);
      const { data: pendingRow } = await pendingQuery.maybeSingle();

      // Fallback: race condition recovery — if the pending row was already consumed but the
      // real phone_number row exists with is_active=false, activate it instead of failing.
      // This happens when OAuth runs twice (user clicks "Conectar" multiple times).
      const { data: stuckRow } = !pendingRow ? await supabase
        .from("whatsapp_configs")
        .select("id, access_token")
        .eq("user_id", user.id)
        .eq("phone_number_id", phone_number_id)
        .eq("is_active", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle() : { data: null };

      const targetRow = pendingRow ?? stuckRow;

      // Check whether this org already has any active number (for is_primary logic)
      // Scope to the current org so a user with numbers in other orgs still gets
      // is_primary=true for their first number in THIS org.
      let activeCountQ = supabase
        .from("whatsapp_configs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_active", true);
      if (orgId) activeCountQ = activeCountQ.eq("organization_id", orgId);
      const { count: activeCount } = await activeCountQ;

      const isFirstNumber = (activeCount ?? 0) === 0;

      if (targetRow) {
        // Upsert by (user_id, phone_number_id) so that reconnecting the same
        // number updates the existing row instead of hitting the unique constraint.
        // Then delete the pending row that served as our OAuth token carrier.
        const { error } = await supabase
          .from("whatsapp_configs")
          .upsert(
            {
              user_id: user.id,
              phone_number_id,             // conflict key
              organization_id: orgId || null,
              waba_id,
              display_phone: display_phone || null,
              business_name: business_name || null,
              is_active: true,
              is_primary: isFirstNumber,
              access_token: targetRow.access_token, // preserve token from OAuth
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,phone_number_id", ignoreDuplicates: false }
          );

        if (error) throw error;

        // Remove the pending row now that it's been promoted to a real config
        if (targetRow.id) {
          await supabase.from("whatsapp_configs")
            .delete()
            .eq("id", targetRow.id)
            .eq("phone_number_id", "pending");
        }

        // Subscribe this WABA to receive webhooks using App Access Token so that
        // the Klosify app is subscribed regardless of which app issued the user token.
        try {
          const META_APP_ID_SAVE = Deno.env.get("META_APP_ID");
          const META_APP_SECRET_SAVE = Deno.env.get("META_APP_SECRET");
          const subToken = (META_APP_ID_SAVE && META_APP_SECRET_SAVE)
            ? `${META_APP_ID_SAVE}|${META_APP_SECRET_SAVE}`
            : targetRow.access_token;
          const subRes = await fetch(`${GRAPH_API}/${waba_id}/subscribed_apps`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${subToken}` },
          });
          console.log("WABA webhook subscription:", JSON.stringify(await subRes.json()));
        } catch (_) { /* non-fatal */ }
      } else {
        throw new Error("No hay un token OAuth pendiente. Reconecta tu cuenta de Meta.");
      }

      // Sync to channels table
      const { data: savedConfig } = await supabase
        .from("whatsapp_configs")
        .select("access_token")
        .eq("user_id", user.id)
        .eq("phone_number_id", phone_number_id)
        .maybeSingle();

      await supabase.from("channels").upsert(
        {
          user_id: user.id,
          organization_id: orgId,
          type: "whatsapp",
          provider: "meta",
          waba_id,
          phone_number_id,
          access_token: savedConfig?.access_token || "",
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
      const { phone_number_id, waba_id, display_phone, business_name } = body;
      let access_token = body.access_token;

      if (!phone_number_id || !waba_id) {
        throw new Error("phone_number_id y waba_id son obligatorios");
      }

      // If no token provided, reuse the pending/latest OAuth token
      if (!access_token) {
        let tokenQ = supabase
          .from("whatsapp_configs")
          .select("access_token")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(1);
        if (orgId) tokenQ = tokenQ.eq("organization_id", orgId);
        const { data: existing } = await tokenQ.maybeSingle();
        access_token = existing?.access_token || null;
        if (!access_token) throw new Error("No hay token guardado. Conéctate primero con Facebook.");
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

      // Check if this is the first active number for this org (for is_primary)
      let acQ = supabase
        .from("whatsapp_configs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_active", true)
        .neq("phone_number_id", "pending");
      if (orgId) acQ = acQ.eq("organization_id", orgId);
      const { count: activeCount } = await acQ;

      const isFirstNumber = (activeCount ?? 0) === 0;

      // Upsert by (user_id, phone_number_id) — updating existing config for same
      // number is fine (token refresh), but adding a new number inserts a new row.
      const { error } = await supabase.from("whatsapp_configs").upsert(
        {
          user_id: user.id,
          organization_id: orgId || null,
          access_token,
          phone_number_id,
          waba_id,
          display_phone: resolvedPhone,
          business_name: resolvedName,
          is_active: true,
          is_primary: isFirstNumber,
          webhook_verified: false,
        },
        { onConflict: "user_id,phone_number_id" }
      );
      if (error) throw error;

      // Also save to channels
      await supabase.from("channels").upsert(
        {
          user_id: user.id,
          organization_id: orgId,
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
        console.log("WABA webhook subscription:", JSON.stringify(await subRes.json()));
      } catch (_) { /* non-fatal — user can trigger manually */ }

      // Remove any leftover pending row for this user
      await supabase.from("whatsapp_configs")
        .delete()
        .eq("user_id", user.id)
        .eq("phone_number_id", "pending");

      return new Response(JSON.stringify({
        success: true,
        display_phone: resolvedPhone,
        business_name: resolvedName,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SET PRIMARY NUMBER ───────────────────────────────────────────────────
    if (action === "set_primary") {
      const { config_id } = body;
      if (!config_id) throw new Error("config_id es obligatorio");

      // Unset all primaries only within the current org so other orgs are unaffected
      let unsetQ = supabase.from("whatsapp_configs")
        .update({ is_primary: false })
        .eq("user_id", user.id);
      if (orgId) unsetQ = unsetQ.eq("organization_id", orgId);
      await unsetQ;

      await supabase.from("whatsapp_configs")
        .update({ is_primary: true })
        .eq("id", config_id)
        .eq("user_id", user.id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── UPDATE NUMBER LABEL ──────────────────────────────────────────────────
    if (action === "update_label") {
      const { config_id, label } = body;
      if (!config_id) throw new Error("config_id es obligatorio");

      let ulQ = supabase.from("whatsapp_configs")
        .update({ label: label || null })
        .eq("id", config_id)
        .eq("user_id", user.id);
      if (orgId) ulQ = ulQ.eq("organization_id", orgId);
      await ulQ;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── LIST ALL ACTIVE CONFIGS ──────────────────────────────────────────────
    if (action === "list_configs") {
      let listQ = supabase
        .from("whatsapp_configs")
        .select("id, phone_number_id, waba_id, display_phone, business_name, label, is_primary, is_active, webhook_verified, created_at")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .neq("phone_number_id", "pending")
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });
      if (orgId) listQ = listQ.eq("organization_id", orgId);
      const { data: configs } = await listQ;

      return new Response(JSON.stringify({ configs: configs || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disconnect") {
      const { config_id } = body;

      if (config_id) {
        // Disconnect a specific number by ID. WhatsApp is shared ORG-WIDE (status
        // is checked per-org), so scope by org — not by the caller's user_id —
        // otherwise a number connected by another member can't be disconnected.
        let oneQ = supabase.from("whatsapp_configs")
          .update({ is_active: false, is_primary: false })
          .eq("id", config_id);
        oneQ = orgId ? oneQ.eq("organization_id", orgId) : oneQ.eq("user_id", user.id);
        await oneQ;

        // Promote next active number within the same org as new primary
        let nextQ = supabase
          .from("whatsapp_configs")
          .select("id")
          .eq("is_active", true)
          .neq("phone_number_id", "pending")
          .order("created_at", { ascending: true })
          .limit(1);
        nextQ = orgId ? nextQ.eq("organization_id", orgId) : nextQ.eq("user_id", user.id);
        const { data: remaining } = await nextQ;

        if (remaining?.[0]) {
          await supabase.from("whatsapp_configs")
            .update({ is_primary: true })
            .eq("id", remaining[0].id);
        }

        await supabase.from("channels")
          .update({ is_active: false, status: "disconnected" })
          .eq("user_id", user.id)
          .eq("type", "whatsapp");
      } else {
        // Disconnect ALL numbers for THIS org (org-wide, matching the status check)
        let disconnectQ = supabase.from("whatsapp_configs").update({ is_active: false });
        disconnectQ = orgId ? disconnectQ.eq("organization_id", orgId) : disconnectQ.eq("user_id", user.id);
        await disconnectQ;

        let channelsQ = supabase.from("channels")
          .update({ is_active: false, status: "disconnected" })
          .eq("user_id", user.id)
          .eq("type", "whatsapp");
        if (orgId) channelsQ = channelsQ.eq("organization_id", orgId);
        await channelsQ;

        // Delete templates only for this org's WABA
        const wabas = await supabase
          .from("whatsapp_configs")
          .select("waba_id")
          .eq("user_id", user.id)
          .eq("is_active", false);
        if (orgId && wabas.data?.length) {
          for (const w of wabas.data) {
            await supabase.from("whatsapp_templates")
              .delete()
              .eq("user_id", user.id)
              .eq("waba_id", w.waba_id);
          }
        } else if (!orgId) {
          await supabase.from("whatsapp_templates")
            .delete()
            .eq("user_id", user.id);
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── WHATSAPP FLOWS (formularios nativos) ─────────────────────────────────
    if (["list_flows", "create_flow", "publish_flow", "delete_flow"].includes(action)) {
      let fq = supabase
        .from("whatsapp_configs")
        .select("waba_id, access_token")
        .eq("is_active", true);
      if (orgId) fq = fq.eq("organization_id", orgId);
      else fq = fq.eq("user_id", user.id);
      const { data: fcfgs } = await fq.order("is_primary", { ascending: false }).limit(1);
      const fcfg = fcfgs?.[0];
      if (!fcfg?.access_token || !fcfg?.waba_id) throw new Error("WhatsApp no está configurado para esta organización");
      const fjson = (b: unknown) => new Response(JSON.stringify(b), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      if (action === "list_flows") {
        const r = await fetch(`${GRAPH_API}/${fcfg.waba_id}/flows?fields=id,name,status,categories&limit=50&access_token=${fcfg.access_token}`);
        const j = await r.json();
        if (j.error) throw new Error(j.error.message);
        return fjson({ flows: j.data ?? [] });
      }

      if (action === "create_flow") {
        // Genera un Flow de una pantalla (formulario) a partir de campos simples,
        // lo crea en el WABA, sube el JSON y lo publica.
        const { name, title, fields } = body as { name: string; title?: string; fields: { label: string; type?: string; options?: string[]; required?: boolean }[] };
        if (!name || !Array.isArray(fields) || !fields.length) throw new Error("name y fields son obligatorios");
        const slug = (x: string) => (x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "campo";
        const children: any[] = [];
        const payload: Record<string, string> = {};
        const used = new Set<string>();
        for (const f of fields.slice(0, 10)) {
          let nm = slug(f.label); let k = 2;
          while (used.has(nm)) nm = `${slug(f.label)}_${k++}`;
          used.add(nm);
          const req = f.required !== false;
          if (f.type === "select" && Array.isArray(f.options) && f.options.length) {
            children.push({ type: "Dropdown", name: nm, label: String(f.label).slice(0, 30), required: req,
              "data-source": f.options.slice(0, 20).map((o: string, oi: number) => ({ id: `opt_${oi}_${slug(o).slice(0, 20)}`, title: String(o).slice(0, 30) })) });
          } else if (f.type === "textarea") {
            children.push({ type: "TextArea", name: nm, label: String(f.label).slice(0, 20), required: req });
          } else if (f.type === "date") {
            children.push({ type: "DatePicker", name: nm, label: String(f.label).slice(0, 40), required: req });
          } else {
            const it = f.type === "number" ? "number" : f.type === "email" ? "email" : f.type === "phone" ? "phone" : "text";
            children.push({ type: "TextInput", name: nm, label: String(f.label).slice(0, 20), required: req, "input-type": it });
          }
          payload[nm] = "${form." + nm + "}";
        }
        children.push({ type: "Footer", label: "Enviar", "on-click-action": { name: "complete", payload } });
        const flowJson = {
          version: "7.2",
          screens: [{ id: "FORM", title: String(title || name).slice(0, 30), terminal: true,
            layout: { type: "SingleColumnLayout", children: [{ type: "Form", name: "form", children }] } }],
        };

        const cr = await fetch(`${GRAPH_API}/${fcfg.waba_id}/flows`, {
          method: "POST",
          headers: { Authorization: `Bearer ${fcfg.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name, categories: ["LEAD_GENERATION"] }),
        });
        const cj = await cr.json();
        if (cj.error) throw new Error(`No se pudo crear el Flow: ${cj.error.message}`);
        const flowId = cj.id;

        const fd = new FormData();
        fd.append("file", new File([JSON.stringify(flowJson)], "flow.json", { type: "application/json" }), "flow.json");
        fd.append("name", "flow.json");
        fd.append("asset_type", "FLOW_JSON");
        const up = await fetch(`${GRAPH_API}/${flowId}/assets`, {
          method: "POST", headers: { Authorization: `Bearer ${fcfg.access_token}` }, body: fd,
        });
        const uj = await up.json();
        if (uj.error) return fjson({ flow_id: flowId, published: false, error: `Flow creado pero el JSON falló: ${uj.error.message}` });
        const validationErrors = (uj.validation_errors ?? []).filter((e: any) => e.error_type !== "WARNING");
        let published = false, publishError: string | null = null;
        if (!validationErrors.length) {
          const pb = await fetch(`${GRAPH_API}/${flowId}/publish`, { method: "POST", headers: { Authorization: `Bearer ${fcfg.access_token}` } });
          const pj = await pb.json();
          published = !!pj.success;
          if (pj.error) publishError = pj.error.message;
        }

        // Plantilla que envía el Flow (patrón Kommo): cuerpo + botón CTA de tipo
        // FLOW. Al aprobarse, permite INICIAR conversaciones con el formulario
        // (no solo dentro de la ventana de 24h).
        let templateResult: any = null;
        if (published && body.template_body) {
          const tplName = String(body.template_name || `${name}_tpl`).toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 60);
          const tplRes = await fetch(`${GRAPH_API}/${fcfg.waba_id}/message_templates`, {
            method: "POST",
            headers: { Authorization: `Bearer ${fcfg.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              name: tplName,
              language: "es",
              category: body.template_category || "MARKETING",
              components: [
                { type: "BODY", text: String(body.template_body).slice(0, 1024) },
                { type: "BUTTONS", buttons: [{
                  type: "FLOW",
                  text: String(body.template_cta || "Abrir formulario").slice(0, 25),
                  flow_id: flowId,
                  navigate_screen: "FORM",
                  flow_action: "NAVIGATE",
                }] },
              ],
            }),
          });
          const tplJson = await tplRes.json();
          if (tplJson.error) {
            templateResult = { error: tplJson.error.message };
          } else {
            templateResult = { id: tplJson.id, status: tplJson.status || "PENDING", name: tplName };
            // Registrar en el catálogo local para que aparezca de inmediato
            await supabase.from("whatsapp_templates").upsert({
              user_id: user.id,
              organization_id: orgId ?? null,
              waba_id: fcfg.waba_id,
              template_id: tplJson.id,
              name: tplName,
              category: body.template_category || "MARKETING",
              language: "es",
              status: tplJson.status || "PENDING",
              body_text: String(body.template_body).slice(0, 1024),
              buttons: [{ type: "FLOW", text: String(body.template_cta || "Abrir formulario").slice(0, 25), flow_id: flowId }],
            }, { onConflict: "template_id" }).then(() => {}, () => {});
          }
        }
        return fjson({ flow_id: flowId, published, validation_errors: validationErrors, publish_error: publishError, template: templateResult });
      }

      if (action === "publish_flow") {
        const pb = await fetch(`${GRAPH_API}/${body.flow_id}/publish`, { method: "POST", headers: { Authorization: `Bearer ${fcfg.access_token}` } });
        return fjson(await pb.json());
      }

      if (action === "delete_flow") {
        const dl = await fetch(`${GRAPH_API}/${body.flow_id}?access_token=${fcfg.access_token}`, { method: "DELETE" });
        return fjson(await dl.json());
      }
    }

    // ── TEMPLATES ────────────────────────────────────────────────────────────

    if (action === "list_templates") {
      let ltQ = supabase
        .from("whatsapp_configs")
        .select("waba_id, access_token, phone_number_id")
        .eq("user_id", user.id)
        .eq("is_active", true);
      if (orgId) ltQ = ltQ.eq("organization_id", orgId);
      const { data: config } = await ltQ.maybeSingle();
      if (!config) throw new Error("WhatsApp no está configurado");

      // Clean up templates from any previous WABA before syncing.
      // After a user switches WhatsApp accounts, the old WABA's templates
      // remain in the DB until next sync — this drops them so the list
      // always reflects the currently connected WABA.
      await supabase
        .from("whatsapp_templates")
        .delete()
        .eq("user_id", user.id)
        .neq("waba_id", config.waba_id);

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
          organization_id: orgId,
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

      let ctQ = supabase
        .from("whatsapp_configs")
        .select("waba_id, access_token")
        .eq("user_id", user.id)
        .eq("is_active", true);
      if (orgId) ctQ = ctQ.eq("organization_id", orgId);
      const { data: config } = await ctQ.maybeSingle();
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
        let dtQ = supabase
          .from("whatsapp_configs")
          .select("waba_id, access_token")
          .eq("user_id", user.id)
          .eq("is_active", true);
        if (orgId) dtQ = dtQ.eq("organization_id", orgId);
        const { data: config } = await dtQ.maybeSingle();

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

      let utQ = supabase
        .from("whatsapp_configs")
        .select("waba_id, access_token")
        .eq("user_id", user.id)
        .eq("is_active", true);
      if (orgId) utQ = utQ.eq("organization_id", orgId);
      const { data: config } = await utQ.maybeSingle();
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

      let stQ = supabase
        .from("whatsapp_configs")
        .select("phone_number_id, access_token")
        .eq("is_active", true);
      if (orgId) {
        stQ = stQ.eq("organization_id", orgId);
      } else {
        stQ = stQ.eq("user_id", user.id);
      }
      const { data: config } = await stQ.maybeSingle();
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

      // Save to messages DB. Store the header media (if any) so the CRM history
      // renders the template's image/video (meta:{id} resolves on demand).
      const hasHeaderMedia = (headerType === "IMAGE" || headerType === "VIDEO" || headerType === "DOCUMENT")
        && (header_media_id || header_media_url);
      await supabase.from("whatsapp_messages").insert({
        user_id: user.id,
        contact_id: contact_id || null,
        wa_message_id: waMessageId,
        phone_number: phone.replace(/[^0-9]/g, ""),
        direction: "outgoing",
        message_type: hasHeaderMedia ? headerType.toLowerCase() : "template",
        media_url: hasHeaderMedia ? (header_media_url || `meta:${header_media_id}`) : null,
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

      // The inbox is ORG-WIDE: any member can open a conversation, but the WA
      // config row belongs to the user who connected the number. Scope by org
      // (primary number first) — filtering by the VIEWER's user_id made media
      // fail for every member except the connector. user_id only as legacy
      // fallback when no org context exists.
      let fmQ = supabase
        .from("whatsapp_configs")
        .select("access_token")
        .eq("is_active", true);
      if (orgId) fmQ = fmQ.eq("organization_id", orgId).order("is_primary", { ascending: false });
      else fmQ = fmQ.eq("user_id", user.id);
      const { data: fmConfigs } = await fmQ.limit(1);
      const config = fmConfigs?.[0];
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

      let smQ = supabase
        .from("whatsapp_configs")
        .select("phone_number_id, access_token")
        .eq("user_id", user.id)
        .eq("is_active", true);
      if (orgId) smQ = smQ.eq("organization_id", orgId);
      const { data: config } = await smQ.maybeSingle();
      if (!config) throw new Error("WhatsApp no está configurado");

      // Decode base64 → Uint8Array
      const binaryStr = atob(file_base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      // Normalize non-standard mime types to what Meta accepts.  Browsers
      // commonly mislabel files with vendor-specific prefixes (audio/x-m4a)
      // or aliases (audio/x-wav, image/jpg) that Meta's strict validator
      // rejects.  Map them to the canonical form before uploading.
      const MIME_ALIASES: Record<string, string> = {
        "audio/x-m4a": "audio/mp4",
        "audio/m4a": "audio/mp4",
        "audio/x-aac": "audio/aac",
        "audio/mp3": "audio/mpeg",
        "audio/x-wav": "audio/wav",      // wav not supported by Meta — will error explicitly later
        "image/jpg": "image/jpeg",
        "image/x-png": "image/png",
      };
      const rawMimeBase = mime_type.split(";")[0].trim().toLowerCase();
      const mimeBase = MIME_ALIASES[rawMimeBase] || rawMimeBase;
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

      // Log incoming params so we can see what mime_type the client sent
      console.log(`send_media INCOMING: mime=${mime_type}, mimeBase=${mimeBase}, filename=${safeFilename}, bytes=${bytes.length}`);

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
