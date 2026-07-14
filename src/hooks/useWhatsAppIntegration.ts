import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { toast } from "sonner";

export interface WhatsAppConfig {
  id: string;
  phone_number_id: string;
  waba_id: string;
  display_phone: string | null;
  business_name: string | null;
  label: string | null;
  is_primary: boolean;
  webhook_verified: boolean;
  is_active: boolean;
  created_at: string;
}


// Build standard OAuth redirect URL for WhatsApp Cloud API connection
// `stateToken` MUST be a single-use nonce from `create_oauth_state` — do NOT
// pass raw user_id here (CSRF vector — see migration 20260519000000).
function buildOAuthRedirectUrl(appId: string, supabaseUrl: string, stateToken: string): string {
  const redirectUri = `${supabaseUrl}/functions/v1/whatsapp-oauth-callback`;
  const scopes = "whatsapp_business_management,whatsapp_business_messaging,business_management";
  return `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${encodeURIComponent(stateToken)}&response_type=code`;
}

// Lazy-load the Facebook JS SDK once. Required for the WhatsApp Embedded Signup
// popup (FB.login with a config_id).
let fbSdkPromise: Promise<void> | null = null;
function loadFacebookSdk(appId: string): Promise<void> {
  if (fbSdkPromise) return fbSdkPromise;
  fbSdkPromise = new Promise<void>((resolve) => {
    const w = window as any;
    if (w.FB) { resolve(); return; }
    w.fbAsyncInit = function () {
      w.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v21.0" });
      resolve();
    };
    const id = "facebook-jssdk";
    if (document.getElementById(id)) { resolve(); return; }
    const js = document.createElement("script");
    js.id = id;
    js.src = "https://connect.facebook.net/en_US/sdk.js";
    js.async = true;
    js.defer = true;
    document.body.appendChild(js);
  });
  return fbSdkPromise;
}

export function useWhatsAppIntegration() {
  const { user } = useAuth();
  const { organizationId } = useOrganizationContext();
  const [configs, setConfigs] = useState<WhatsAppConfig[]>([]);
  const [loading, setLoading] = useState(true);
  // One auto verify_registration pass per mount (avoids loops).
  const autoVerifiedRef = useRef(false);
  const [connecting, setConnecting] = useState(false);
  const [metaAppId, setMetaAppId] = useState<string | null>(null);
  const [waConfigId, setWaConfigId] = useState<string | null>(null);
  const [pendingOAuth, setPendingOAuth] = useState(false);

  // Primary config (or first active) — kept for backward compatibility
  const config = configs.find(c => c.is_primary) ?? configs[0] ?? null;
  const isConnected = configs.length > 0;

  useEffect(() => {
    supabase.functions.invoke("facebook-get-app-id").then(({ data }) => {
      if (data?.app_id) {
        setMetaAppId(data.app_id);
      }
      if (data?.wa_config_id) {
        setWaConfigId(data.wa_config_id);
      }
    });
  }, []);

  const fetchConfig = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    try {
      // WhatsApp connections are shared ORG-WIDE: scope by organization so every
      // member sees the same connected numbers (not only the user who connected).
      let query = supabase
        .from("whatsapp_configs")
        .select("id, phone_number_id, waba_id, display_phone, business_name, label, is_primary, webhook_verified, is_active, created_at")
        .eq("is_active", true)
        .neq("phone_number_id", "pending")
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });
      if (organizationId) query = query.eq("organization_id", organizationId);
      else query = query.eq("user_id", user.id);
      const { data, error } = await query;
      if (error) throw error;
      setConfigs(data ?? []);

      // Auto-heal stale "pending activation": if a number shows as unverified
      // (e.g. after a reconnection) ask Meta for its real status once; when it's
      // already CONNECTED the flag is fixed server-side and we refresh the list.
      if ((data ?? []).some((c: any) => !c.webhook_verified) && !autoVerifiedRef.current) {
        autoVerifiedRef.current = true;
        supabase.functions
          .invoke("whatsapp-api", { body: { action: "verify_registration", organization_id: organizationId ?? null } })
          .then(({ data: vr }) => {
            if (vr?.healed > 0) {
              query.then(({ data: fresh }: any) => setConfigs(fresh ?? []));
            }
          })
          .catch(() => {});
      }
    } catch (e: any) {
      console.warn("Error fetching WA configs:", e);
    } finally {
      setLoading(false);
    }
  }, [user, organizationId]);

  // Fetch configs on mount
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // NOTE: OAuth callback URL params (wa_connected, wa_token_ready, wa_error) are
  // intentionally NOT handled here. They are handled directly in IntegrationsPage
  // to avoid the race condition where multiple hook instances compete to consume
  // the URL param, with the wrong instance winning.

  // OAuth redirect flow — used both for first connection and adding a new number
  const connect = useCallback(async () => {
    if (!user || !metaAppId) {
      toast.error("La configuración de Meta no está lista. Intenta de nuevo.");
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      toast.error("URL del backend no configurada.");
      return;
    }

    const { data: stateToken, error: stateErr } = await supabase.rpc(
      "create_oauth_state",
      { p_provider: "whatsapp", p_organization_id: organizationId ?? null },
    );
    if (stateErr || !stateToken) {
      console.warn("create_oauth_state failed for whatsapp, using UUID fallback:", stateErr);
      const oauthUrl = buildOAuthRedirectUrl(metaAppId, supabaseUrl, user.id);
      window.location.href = oauthUrl;
      return;
    }

    const oauthUrl = buildOAuthRedirectUrl(metaAppId, supabaseUrl, stateToken);
    window.location.href = oauthUrl;
  }, [user, metaAppId]);

  // PROPER WhatsApp Embedded Signup (Tech Provider flow). This is what makes
  // EXTERNAL customers' WhatsApp work: the popup shares the customer's WABA with
  // our app and lets Meta deliver webhooks (incoming messages + delivery status).
  // Falls back to the plain OAuth redirect when no config_id is configured.
  const launchEmbeddedSignup = useCallback(async (opts?: { coexistence?: boolean }) => {
    if (!metaAppId) {
      toast.error("La configuración de Meta no está lista. Intenta de nuevo.");
      return;
    }
    // Without a config_id we cannot run Embedded Signup — fall back to OAuth.
    if (!waConfigId) {
      console.warn("META_WA_CONFIG_ID not configured — falling back to OAuth redirect.");
      return connect();
    }

    setConnecting(true);
    try {
      await loadFacebookSdk(metaAppId);
      const FB = (window as any).FB;
      if (!FB) throw new Error("No se pudo cargar el SDK de Facebook.");

      // Capture waba_id + phone_number_id emitted by the Embedded Signup popup.
      const session: { waba_id?: string; phone_number_id?: string } = {};
      const messageHandler = (event: MessageEvent) => {
        if (typeof event.origin !== "string" || !event.origin.endsWith("facebook.com")) return;
        try {
          const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
          if (data?.type === "WA_EMBEDDED_SIGNUP" && data?.data) {
            if (data.data.waba_id) session.waba_id = data.data.waba_id;
            if (data.data.phone_number_id) session.phone_number_id = data.data.phone_number_id;
          }
        } catch {
          /* non-JSON messages are not ours */
        }
      };
      window.addEventListener("message", messageHandler);

      // NOTE: the FB SDK rejects async callbacks ("Expression is of type
      // asyncfunction, not function"), so wrap the async work in a plain fn.
      FB.login(
        (response: any) => {
          void (async () => {
            window.removeEventListener("message", messageHandler);
            const code = response?.authResponse?.code;
            if (!code) {
              setConnecting(false);
              toast.error("Conexión cancelada.");
              return;
            }
            try {
              const { data, error } = await supabase.functions.invoke("whatsapp-embedded-signup", {
                body: {
                  code,
                  waba_id: session.waba_id ?? null,
                  phone_number_id: session.phone_number_id ?? null,
                  organization_id: organizationId ?? null,
                },
              });
              if (error || data?.error) throw new Error(data?.error || error?.message);
              if (data?.status === "pending") {
                toast.success("Cuenta vinculada. Selecciona el número para terminar.");
              } else {
                toast.success("WhatsApp conectado. Los mensajes ya llegan al CRM.");
              }
              await fetchConfig();
            } catch (e: any) {
              toast.error(e?.message || "Error al conectar WhatsApp.");
            } finally {
              setConnecting(false);
            }
          })();
        },
        {
          config_id: waConfigId,
          response_type: "code",
          override_default_response_type: true,
          // featureType 'whatsapp_business_app_onboarding' = coexistence: the
          // client KEEPS using their WhatsApp Business app while the number also
          // connects to the Cloud API (QR scan inside the popup).
          extras: { setup: {}, featureType: opts?.coexistence ? "whatsapp_business_app_onboarding" : "", sessionInfoVersion: "3" },
        }
      );
    } catch (e: any) {
      setConnecting(false);
      toast.error(e?.message || "No se pudo iniciar la conexión.");
    }
  }, [metaAppId, waConfigId, organizationId, connect, fetchConfig]);

  const getWabaAccounts = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: { action: "get_waba_accounts" },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message);
    return data.waba_accounts || [];
  }, []);

  const getPhoneNumbers = useCallback(async (wabaId: string) => {
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: { action: "get_phone_numbers", waba_id: wabaId },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message);
    return data.phone_numbers || [];
  }, []);

  const savePhoneNumber = useCallback(async (params: {
    waba_id: string;
    phone_number_id: string;
    display_phone?: string;
    business_name?: string;
  }) => {
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: { action: "save_phone_number", ...params, organization_id: organizationId ?? null },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message);
    toast.success("Número de WhatsApp conectado correctamente");
    await fetchConfig();
  }, [fetchConfig]);

  const saveManualConfig = useCallback(async (params: {
    phone_number_id: string;
    waba_id: string;
    access_token?: string;
    display_phone?: string;
    business_name?: string;
  }) => {
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: { action: "save_manual_config", ...params, organization_id: organizationId ?? null },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message);
    toast.success("Número de WhatsApp conectado correctamente");
    await fetchConfig();
    return data;
  }, [fetchConfig]);

  // Disconnect a specific number by config ID (or all numbers if no ID given)
  const disconnect = useCallback(async (configId?: string) => {
    const { error } = await supabase.functions.invoke("whatsapp-api", {
      body: { action: "disconnect", config_id: configId, organization_id: organizationId ?? null },
    });
    if (!error) {
      if (configId) {
        setConfigs(prev => prev.filter(c => c.id !== configId));
        toast.success("Número desconectado");
      } else {
        setConfigs([]);
        toast.success("WhatsApp desconectado");
      }
    }
  }, []);

  // Set a number as the primary sending number
  const setPrimary = useCallback(async (configId: string) => {
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: { action: "set_primary", config_id: configId },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message);
    setConfigs(prev => prev.map(c => ({ ...c, is_primary: c.id === configId })));
  }, []);

  // Update the display label for a number
  const updateLabel = useCallback(async (configId: string, label: string) => {
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: { action: "update_label", config_id: configId, label },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message);
    setConfigs(prev => prev.map(c => c.id === configId ? { ...c, label } : c));
  }, []);

  const sendMessage = async (phone: string, message: string, contactId?: string, phoneNumberId?: string) => {
    const { data, error } = await supabase.functions.invoke("send-whatsapp", {
      body: { phone, message, contact_id: contactId, phone_number_id: phoneNumberId, organization_id: organizationId ?? null },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const registerPhone = useCallback(async (pin: string, phoneNumberId?: string) => {
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: { action: "register_phone", pin, phone_number_id: phoneNumberId ?? null, organization_id: organizationId ?? null },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message);
    return data;
  }, [organizationId]);

  // Re-verificación OTP del número (cuando Meta responde 133006).
  const requestVerificationCode = useCallback(async (codeMethod: "SMS" | "VOICE") => {
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: { action: "request_verification_code", code_method: codeMethod, language: "es", organization_id: organizationId ?? null },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message);
    return data;
  }, [organizationId]);

  const verifyCode = useCallback(async (code: string) => {
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: { action: "verify_code", code, organization_id: organizationId ?? null },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message);
    return data;
  }, [organizationId]);

  const resubscribeWebhook = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: { action: "subscribe_waba", organization_id: organizationId ?? null },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message);
    return data;
  }, [organizationId]);

  const checkHasPendingToken = useCallback(async () => {
    if (!user) return false;
    let query = supabase
      .from("whatsapp_configs")
      .select("phone_number_id, is_active")
      .eq("user_id", user.id)
      .eq("phone_number_id", "pending");
    if (organizationId) query = query.eq("organization_id", organizationId);
    const { data } = await query.maybeSingle();
    return !!data;
  }, [user, organizationId]);

  return {
    // Multi-number: full list
    configs,
    // Backward compat: primary or first config
    config,
    isConnected,
    loading,
    connecting,
    metaAppId,
    waConfigId,
    pendingOAuth,
    setPendingOAuth,
    connect,
    launchEmbeddedSignup,
    disconnect,
    setPrimary,
    updateLabel,
    getWabaAccounts,
    getPhoneNumbers,
    savePhoneNumber,
    saveManualConfig,
    refreshConfig: fetchConfig,
    checkHasPendingToken,
    registerPhone,
    requestVerificationCode,
    verifyCode,
    resubscribeWebhook,
    sendMessage,
  };
}
