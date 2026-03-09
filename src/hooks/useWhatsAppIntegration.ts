import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface WhatsAppConfig {
  id: string;
  phone_number_id: string;
  waba_id: string;
  display_phone: string | null;
  business_name: string | null;
  webhook_verified: boolean;
  is_active: boolean;
  created_at: string;
}

interface EmbeddedSignupResult {
  success: boolean;
  status: "connected" | "pending";
  waba_id?: string;
  waba_name?: string;
  phone_number_id?: string;
  display_phone?: string;
  business_name?: string;
  error?: string;
}

// Build OAuth redirect URL for standard WhatsApp Cloud API connection
function buildOAuthRedirectUrl(appId: string, supabaseUrl: string, userId: string): string {
  const redirectUri = `${supabaseUrl}/functions/v1/whatsapp-oauth-callback`;
  const scopes = "whatsapp_business_management,whatsapp_business_messaging,business_management";
  return `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${userId}&response_type=code`;
}

export function useWhatsAppIntegration() {
  const { user } = useAuth();
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [metaAppId, setMetaAppId] = useState<string | null>(null);
  const [waConfigId, setWaConfigId] = useState<string | null>(null);
  const sdkLoadedRef = useRef(false);

  const isConnected = !!config?.is_active && config?.phone_number_id !== "pending";

  useEffect(() => {
    supabase.functions.invoke("facebook-get-app-id").then(({ data }) => {
      if (data?.app_id) {
        setMetaAppId(data.app_id);
        // Pre-load Facebook SDK
        loadFacebookSDK(data.app_id).then(() => {
          sdkLoadedRef.current = true;
        });
      }
      if (data?.wa_config_id) setWaConfigId(data.wa_config_id);
    });
  }, []);

  const fetchConfig = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from("whatsapp_configs")
        .select("id, phone_number_id, waba_id, display_phone, business_name, webhook_verified, is_active, created_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (data && data.is_active && data.phone_number_id !== "pending") {
        setConfig(data);
      } else {
        setConfig(null);
      }
    } catch (e: any) {
      console.error("Error fetching WA config:", e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  // Embedded Signup flow using FB.login()
  const connect = useCallback(() => {
    if (!user || !metaAppId) {
      toast.error("La configuración de Meta no está lista. Intenta de nuevo.");
      return;
    }

    setConnecting(true);

    // Safety timeout: if popup is blocked or never responds, reset after 60s
    const safetyTimeout = setTimeout(() => {
      setConnecting(false);
      toast.error("No se detectó respuesta del popup de Meta. ¿Se bloqueó el popup? Permite popups e intenta de nuevo.");
    }, 60000);

    const launchEmbeddedSignup = () => {
      const FB = (window as any).FB;
      if (!FB) {
        clearTimeout(safetyTimeout);
        toast.error("Error al cargar Facebook SDK. Recarga la página.");
        setConnecting(false);
        return;
      }

      const loginParams: any = {
        scope: "whatsapp_business_management,whatsapp_business_messaging,business_management",
        extras: {
          feature: "whatsapp_embedded_signup",
          version: 2,
          sessionInfoVersion: 2,
        },
        override_default_response_type: true,
        response_type: "code",
      };

      if (waConfigId) {
        loginParams.config_id = waConfigId;
      }

      try {
        FB.login((response: any) => {
          clearTimeout(safetyTimeout);
          if (response.authResponse?.code) {
            supabase.functions.invoke("whatsapp-embedded-signup", {
              body: { code: response.authResponse.code },
            }).then(({ data, error }) => {
              if (error || data?.error) {
                console.error("Embedded Signup error:", data?.error || error?.message);
                toast.error("Error al completar la conexión: " + (data?.error || error?.message));
              } else {
                const result = data as EmbeddedSignupResult;
                if (result.status === "connected") {
                  toast.success(`WhatsApp conectado: ${result.display_phone || result.business_name}`);
                  fetchConfig();
                } else if (result.status === "pending") {
                  toast.info("Cuenta de Meta conectada. Selecciona tu número de WhatsApp.");
                }
              }
              setConnecting(false);
            }).catch((e: any) => {
              console.error("Embedded Signup error:", e);
              toast.error("Error al completar la conexión: " + e.message);
              setConnecting(false);
            });
          } else {
            console.log("Embedded Signup cancelled or failed:", response);
            toast.error("Conexión cancelada o fallida.");
            setConnecting(false);
          }
        }, loginParams);
      } catch (e: any) {
        clearTimeout(safetyTimeout);
        console.error("FB.login error:", e);
        toast.error("Error al abrir el popup de Meta: " + e.message);
        setConnecting(false);
      }
    };

    if (sdkLoadedRef.current) {
      launchEmbeddedSignup();
    } else {
      loadFacebookSDK(metaAppId).then(() => {
        sdkLoadedRef.current = true;
        launchEmbeddedSignup();
      }).catch(() => {
        clearTimeout(safetyTimeout);
        toast.error("No se pudo cargar el SDK de Facebook.");
        setConnecting(false);
      });
    }
  }, [user, metaAppId, waConfigId, fetchConfig]);

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
      body: { action: "save_phone_number", ...params },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message);
    toast.success("WhatsApp Business conectado correctamente");
    await fetchConfig();
  }, [fetchConfig]);

  const saveManualConfig = useCallback(async (params: {
    phone_number_id: string;
    waba_id: string;
    access_token: string;
    display_phone?: string;
    business_name?: string;
  }) => {
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: { action: "save_manual_config", ...params },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message);
    toast.success("WhatsApp Business conectado correctamente");
    await fetchConfig();
    return data;
  }, [fetchConfig]);

  const disconnect = useCallback(async () => {
    const { error } = await supabase.functions.invoke("whatsapp-api", {
      body: { action: "disconnect" },
    });
    if (!error) {
      setConfig(null);
      toast.success("WhatsApp desconectado");
    }
  }, []);

  const sendMessage = async (phone: string, message: string, contactId?: string) => {
    const { data, error } = await supabase.functions.invoke("send-whatsapp", {
      body: { phone, message, contact_id: contactId },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const checkHasPendingToken = useCallback(async () => {
    if (!user) return false;
    const { data } = await supabase
      .from("whatsapp_configs")
      .select("phone_number_id, is_active")
      .eq("user_id", user.id)
      .maybeSingle();
    return !!data && (!data.is_active || data.phone_number_id === "pending");
  }, [user]);

  return {
    config,
    isConnected,
    loading,
    connecting,
    metaAppId,
    connect,
    disconnect,
    getWabaAccounts,
    getPhoneNumbers,
    savePhoneNumber,
    saveManualConfig,
    refreshConfig: fetchConfig,
    checkHasPendingToken,
    sendMessage,
  };
}
