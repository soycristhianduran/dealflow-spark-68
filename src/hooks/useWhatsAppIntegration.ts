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

// Load Facebook SDK dynamically
function loadFacebookSDK(appId: string): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).FB) {
      resolve();
      return;
    }

    (window as any).fbAsyncInit = function () {
      (window as any).FB.init({
        appId,
        cookie: true,
        xfbml: false,
        version: "v21.0",
      });
      resolve();
    };

    if (!document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
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

    const launchEmbeddedSignup = () => {
      const FB = (window as any).FB;
      if (!FB) {
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

      // If we have a config_id, use it for a more streamlined experience
      if (waConfigId) {
        loginParams.config_id = waConfigId;
      }

      FB.login(async (response: any) => {
        if (response.authResponse?.code) {
          try {
            // Send code to backend for token exchange
            const { data, error } = await supabase.functions.invoke("whatsapp-embedded-signup", {
              body: { code: response.authResponse.code },
            });

            if (error || data?.error) {
              throw new Error(data?.error || error?.message || "Error en el registro");
            }

            const result = data as EmbeddedSignupResult;
            
            if (result.status === "connected") {
              toast.success(`WhatsApp conectado: ${result.display_phone || result.business_name}`);
              await fetchConfig();
            } else if (result.status === "pending") {
              toast.info("Cuenta de Meta conectada. Selecciona tu número de WhatsApp.");
            }
          } catch (e: any) {
            console.error("Embedded Signup error:", e);
            toast.error("Error al completar la conexión: " + e.message);
          }
        } else {
          console.log("Embedded Signup cancelled or failed:", response);
          toast.error("Conexión cancelada o fallida.");
        }
        setConnecting(false);
      }, loginParams);
    };

    if (sdkLoadedRef.current) {
      launchEmbeddedSignup();
    } else {
      loadFacebookSDK(metaAppId).then(() => {
        sdkLoadedRef.current = true;
        launchEmbeddedSignup();
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
    refreshConfig: fetchConfig,
    checkHasPendingToken,
    sendMessage,
  };
}
