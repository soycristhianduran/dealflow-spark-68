import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface FbPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
}

interface FbForm {
  id: string;
  name: string;
  status: string;
}

interface FbAdAccount {
  id: string;
  name: string;
  account_status: number;
  currency: string;
}

interface FbStatus {
  connected: boolean;
  pages: { page_id: string; page_name: string }[];
  forms: { form_id: string; form_name: string; page_id: string; is_syncing: boolean }[];
  campaigns_count: number;
}

export function useFacebookIntegration() {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<FbStatus | null>(null);

  const checkConnection = useCallback(async () => {
    if (!user) {
      setIsConnected(false);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("facebook_tokens")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    setIsConnected(!!data);

    if (data) {
      // Get full status
      const { data: statusData } = await supabase.functions.invoke("facebook-api", {
        body: { action: "status" },
      });
      if (statusData) setStatus(statusData);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  // Listen for OAuth popup result
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "fb-oauth-success") {
        setIsConnected(true);
        setConnecting(false);
        toast.success("Facebook conectado exitosamente");
        checkConnection();
      } else if (event.data?.type === "fb-oauth-error") {
        setConnecting(false);
        toast.error("Error al conectar con Facebook: " + (event.data.error || "desconocido"));
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [checkConnection]);

  const connect = useCallback(() => {
    if (!user) return;
    setConnecting(true);

    const appId = import.meta.env.VITE_META_APP_ID;
    if (!appId) {
      // Call the edge function to get the OAuth URL instead
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const redirectUri = encodeURIComponent(`${supabaseUrl}/functions/v1/facebook-oauth-callback`);
      // We'll need the app ID from the edge function, for now use a workaround
      toast.error("Configuración de Meta App en proceso");
      setConnecting(false);
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const redirectUri = encodeURIComponent(`${supabaseUrl}/functions/v1/facebook-oauth-callback`);
    const scopes = "pages_show_list,pages_read_engagement,leads_retrieval,pages_manage_ads,pages_messaging,ads_read,business_management";
    const state = user.id;

    const oauthUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scopes}&state=${state}&response_type=code`;

    const w = 600;
    const h = 700;
    const left = window.screenX + (window.innerWidth - w) / 2;
    const top = window.screenY + (window.innerHeight - h) / 2;
    window.open(oauthUrl, "fb-oauth", `width=${w},height=${h},left=${left},top=${top}`);
  }, [user]);

  const disconnect = useCallback(async () => {
    const { error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "disconnect" },
    });
    if (!error) {
      setIsConnected(false);
      setStatus(null);
      toast.success("Facebook desconectado");
    }
  }, []);

  const getPages = useCallback(async (): Promise<FbPage[]> => {
    const { data, error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "get_pages" },
    });
    if (error) { toast.error("Error al obtener páginas"); return []; }
    return data.pages || [];
  }, []);

  const savePages = useCallback(async (pages: { page_id: string; page_name: string; page_access_token: string }[]) => {
    const { error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "save_pages", pages },
    });
    if (error) toast.error("Error al guardar páginas");
    else toast.success("Páginas guardadas");
    checkConnection();
  }, [checkConnection]);

  const getLeadForms = useCallback(async (pageId: string): Promise<FbForm[]> => {
    const { data, error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "get_lead_forms", page_id: pageId },
    });
    if (error) { toast.error("Error al obtener formularios"); return []; }
    return data.forms || [];
  }, []);

  const saveLeadForms = useCallback(async (pageId: string, forms: { form_id: string; form_name: string; form_status?: string }[]) => {
    const { error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "save_lead_forms", page_id: pageId, forms },
    });
    if (error) toast.error("Error al guardar formularios");
    else toast.success("Formularios sincronizados");
    checkConnection();
  }, [checkConnection]);

  const getConversations = useCallback(async (pageId: string) => {
    const { data, error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "get_conversations", page_id: pageId },
    });
    if (error) { toast.error("Error al obtener conversaciones"); return []; }
    return data.conversations || [];
  }, []);

  const getAdAccounts = useCallback(async (): Promise<FbAdAccount[]> => {
    const { data, error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "get_ad_accounts" },
    });
    if (error) { toast.error("Error al obtener cuentas publicitarias"); return []; }
    return data.ad_accounts || [];
  }, []);

  const importCampaigns = useCallback(async (adAccountId: string) => {
    const { data, error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "get_campaigns", ad_account_id: adAccountId },
    });
    if (error) { toast.error("Error al importar campañas"); return null; }
    toast.success(`${data.total} campañas importadas`);
    checkConnection();
    return data;
  }, [checkConnection]);

  return {
    isConnected, loading, connecting, status,
    connect, disconnect, checkConnection,
    getPages, savePages,
    getLeadForms, saveLeadForms,
    getConversations,
    getAdAccounts, importCampaigns,
  };
}
