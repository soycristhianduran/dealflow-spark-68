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

export function useWhatsAppIntegration() {
  const { user } = useAuth();
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [metaAppId, setMetaAppId] = useState<string | null>(null);

  const isConnected = !!config?.is_active && config?.phone_number_id !== "pending";

  useEffect(() => {
    supabase.functions.invoke("facebook-get-app-id").then(({ data }) => {
      if (data?.app_id) setMetaAppId(data.app_id);
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
      // Only set config if truly active (not pending)
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

  // Handle OAuth callback params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("wa_token_ready") === "true") {
      setConnecting(false);
      toast.success("Cuenta de Meta conectada. Selecciona tu número de WhatsApp.");
      const url = new URL(window.location.href);
      url.searchParams.delete("wa_token_ready");
      window.history.replaceState({}, "", url.pathname + url.search);
    } else if (params.get("wa_error")) {
      setConnecting(false);
      toast.error("Error al conectar con Meta: " + params.get("wa_error"));
      const url = new URL(window.location.href);
      url.searchParams.delete("wa_error");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, []);

  const connect = useCallback(() => {
    if (!user || !metaAppId) {
      toast.error("La configuración de Meta no está lista. Intenta de nuevo.");
      return;
    }
    setConnecting(true);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const redirectUri = encodeURIComponent(`${supabaseUrl}/functions/v1/whatsapp-oauth-callback`);
    // WhatsApp Business API scopes
    const scopes = "whatsapp_business_management,whatsapp_business_messaging,business_management";
    const state = user.id;
    const oauthUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${metaAppId}&redirect_uri=${redirectUri}&scope=${scopes}&state=${state}&response_type=code`;
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

  // Check if there's a pending token (OAuth done but phone not selected)
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
