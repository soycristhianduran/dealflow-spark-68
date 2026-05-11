import { useState, useEffect, useCallback } from "react";
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


// Build standard OAuth redirect URL for WhatsApp Cloud API connection
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
  const [pendingOAuth, setPendingOAuth] = useState(false);

  const isConnected = !!config?.is_active && config?.phone_number_id !== "pending";

  useEffect(() => {
    supabase.functions.invoke("facebook-get-app-id").then(({ data }) => {
      if (data?.app_id) {
        setMetaAppId(data.app_id);
      }
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

  // Fetch config on mount
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // NOTE: OAuth callback URL params (wa_connected, wa_token_ready, wa_error) are
  // intentionally NOT handled here. They are handled directly in IntegrationsPage
  // to avoid the race condition where multiple hook instances compete to consume
  // the URL param, with the wrong instance winning.

  // OAuth redirect flow
  const connect = useCallback(() => {
    if (!user || !metaAppId) {
      toast.error("La configuración de Meta no está lista. Intenta de nuevo.");
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      toast.error("URL del backend no configurada.");
      return;
    }

    const oauthUrl = buildOAuthRedirectUrl(metaAppId, supabaseUrl, user.id);
    window.location.href = oauthUrl;
  }, [user, metaAppId]);

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
    pendingOAuth,
    setPendingOAuth,
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
