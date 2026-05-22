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
  questions?: { key: string; label: string; type: string }[];
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

interface FbTokenHealth {
  needs_reconnect: boolean;
  token_expires_at: string | null;
  last_refresh_error: string | null;
}

export function useFacebookIntegration() {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<FbStatus | null>(null);
  const [tokenHealth, setTokenHealth] = useState<FbTokenHealth | null>(null);
  const [metaAppId, setMetaAppId] = useState<string | null>(null);

  // Fetch META_APP_ID from an edge function on mount
  useEffect(() => {
    supabase.functions.invoke("facebook-get-app-id").then(({ data }) => {
      if (data?.app_id) setMetaAppId(data.app_id);
    });
  }, []);

  const checkConnection = useCallback(async () => {
    if (!user) {
      setIsConnected(false);
      setLoading(false);
      return;
    }
    // Pull token health alongside the existence check so the UI can show a
    // "Reconnect Facebook" banner BEFORE the user notices things broken.
    // `as any` because the generated Supabase types don't include the new
    // tracking columns until the next `gen types typescript` run.
    const { data } = await (supabase as any)
      .from("facebook_tokens")
      .select("id, needs_reconnect, token_expires_at, last_refresh_error")
      .eq("user_id", user.id)
      .maybeSingle();
    setIsConnected(!!data);

    if (data) {
      setTokenHealth({
        needs_reconnect: !!data.needs_reconnect,
        token_expires_at: data.token_expires_at ?? null,
        last_refresh_error: data.last_refresh_error ?? null,
      });
      const { data: statusData } = await supabase.functions.invoke("facebook-api", {
        body: { action: "status" },
      });
      if (statusData) setStatus(statusData);
    } else {
      setTokenHealth(null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    checkConnection();

    // Handle redirect-based OAuth callback
    const params = new URLSearchParams(window.location.search);
    if (params.get("fb_connected") === "true") {
      setIsConnected(true);
      setConnecting(false);
      toast.success("Facebook conectado exitosamente");
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete("fb_connected");
      window.history.replaceState({}, "", url.pathname + url.search);
      checkConnection();
    } else if (params.get("fb_error")) {
      setConnecting(false);
      toast.error("Error al conectar con Facebook: " + params.get("fb_error"));
      const url = new URL(window.location.href);
      url.searchParams.delete("fb_error");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [checkConnection]);


  const connect = useCallback(async () => {
    if (!user || !metaAppId) {
      toast.error("La configuración de Meta no está lista. Intenta de nuevo.");
      return;
    }
    setConnecting(true);

    // Request a single-use, server-bound nonce for the OAuth `state` param.
    // This prevents CSRF: previously we used the raw user_id, which an
    // attacker who knew the victim's UUID could spoof to plant their own
    // Facebook tokens under the victim's account.
    // `as any` until the generated Supabase types include this new RPC.
    const { data: stateToken, error: stateErr } = await (supabase as any).rpc(
      "create_oauth_state",
      { p_provider: "facebook" },
    );
    if (stateErr || !stateToken) {
      setConnecting(false);
      toast.error("No se pudo iniciar la conexión con Facebook. Intenta de nuevo.");
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const redirectUri = encodeURIComponent(`${supabaseUrl}/functions/v1/facebook-oauth-callback`);
    const scopes = [
      // Pages (Facebook)
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_metadata",
      "pages_manage_ads",
      "pages_messaging",
      // Lead forms
      "leads_retrieval",
      // Ads
      "ads_read",
      // Business
      "business_management",
      // Instagram (DMs, comments, content read)
      "instagram_basic",
      "instagram_manage_messages",
      "instagram_manage_comments",
      "instagram_manage_insights",
    ].join(",");

    const oauthUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${metaAppId}&redirect_uri=${redirectUri}&scope=${scopes}&state=${encodeURIComponent(stateToken)}&response_type=code`;

    // Use direct redirect instead of popup (cross-origin popup doesn't work)
    window.location.href = oauthUrl;
  }, [user, metaAppId]);

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

  const saveFieldMappings = useCallback(async (formId: string, mappings: { fb_field_name: string; contact_field: string; is_custom_field: boolean }[]) => {
    const { error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "save_field_mappings", form_id: formId, mappings },
    });
    if (error) toast.error("Error al guardar mapeo de campos");
    else toast.success("Mapeo de campos guardado");
  }, []);

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

  const fetchLeads = useCallback(async (formId: string, pageId: string) => {
    const { data, error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "fetch_leads", form_id: formId, page_id: pageId },
    });
    if (error) { toast.error("Error al importar leads"); return null; }
    const imported = data?.imported || { contacts: 0, deals: 0 };
    if (imported.contacts > 0) {
      toast.success(`${imported.contacts} contactos importados, ${imported.deals} leads creados`);
    } else {
      toast.info("No se encontraron leads nuevos para importar");
    }
    return data;
  }, []);

  const subscribeLeadgen = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "subscribe_leadgen" },
    });
    if (error) { toast.error("Error al suscribir páginas a leadgen"); return null; }
    if (data?.success) {
      toast.success("Páginas suscritas a leadgen exitosamente");
    } else {
      const failed = (data?.results || []).filter((r: any) => !r.subscribed);
      if (failed.length > 0) {
        toast.error(`Error en ${failed.length} página(s): ${failed[0]?.error || "desconocido"}`);
      }
    }
    return data;
  }, []);

  return {
    isConnected, loading, connecting, status, tokenHealth,
    connect, disconnect, checkConnection,
    getPages, savePages,
    getLeadForms, saveLeadForms, saveFieldMappings,
    getConversations,
    getAdAccounts, importCampaigns, fetchLeads,
    subscribeLeadgen,
  };
}
