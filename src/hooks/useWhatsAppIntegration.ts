import { useState, useEffect, useCallback } from "react";
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

export function useWhatsAppIntegration() {
  const { user } = useAuth();
  const { organizationId } = useOrganizationContext();
  const [configs, setConfigs] = useState<WhatsAppConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [metaAppId, setMetaAppId] = useState<string | null>(null);
  const [pendingOAuth, setPendingOAuth] = useState(false);

  // Primary config (or first active) — kept for backward compatibility
  const config = configs.find(c => c.is_primary) ?? configs[0] ?? null;
  const isConnected = configs.length > 0;

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
      let query = supabase
        .from("whatsapp_configs")
        .select("id, phone_number_id, waba_id, display_phone, business_name, label, is_primary, webhook_verified, is_active, created_at")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .neq("phone_number_id", "pending")
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });
      if (organizationId) query = query.eq("organization_id", organizationId);
      const { data, error } = await query;
      if (error) throw error;
      setConfigs(data ?? []);
    } catch (e: any) {
      console.warn("Error fetching WA configs:", e);
    } finally {
      setLoading(false);
    }
  }, [user]);

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
      body: { action: "save_manual_config", ...params },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message);
    toast.success("Número de WhatsApp conectado correctamente");
    await fetchConfig();
    return data;
  }, [fetchConfig]);

  // Disconnect a specific number by config ID (or all numbers if no ID given)
  const disconnect = useCallback(async (configId?: string) => {
    const { error } = await supabase.functions.invoke("whatsapp-api", {
      body: { action: "disconnect", config_id: configId },
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

  const registerPhone = useCallback(async (pin: string) => {
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: { action: "register_phone", pin },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message);
    return data;
  }, []);

  const resubscribeWebhook = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: { action: "subscribe_waba", organization_id: organizationId ?? null },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message);
    return data;
  }, [organizationId]);

  const checkHasPendingToken = useCallback(async () => {
    if (!user) return false;
    const { data } = await supabase
      .from("whatsapp_configs")
      .select("phone_number_id, is_active")
      .eq("user_id", user.id)
      .eq("phone_number_id", "pending")
      .maybeSingle();
    return !!data;
  }, [user]);

  return {
    // Multi-number: full list
    configs,
    // Backward compat: primary or first config
    config,
    isConnected,
    loading,
    connecting,
    metaAppId,
    pendingOAuth,
    setPendingOAuth,
    connect,
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
    resubscribeWebhook,
    sendMessage,
  };
}
