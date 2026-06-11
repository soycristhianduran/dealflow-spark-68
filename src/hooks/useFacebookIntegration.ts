import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { toast } from "sonner";

interface FbPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  connected_org_id?: string | null;
  connected_org_name?: string | null;
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

// Lazy-load the Facebook JS SDK once (needed for FB.login with a config_id).
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
    js.id = id; js.src = "https://connect.facebook.net/en_US/sdk.js"; js.async = true; js.defer = true;
    document.body.appendChild(js);
  });
  return fbSdkPromise;
}

export function useFacebookIntegration() {
  const { user } = useAuth();
  const { organizationId } = useOrganizationContext();
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<FbStatus | null>(null);
  const [tokenHealth, setTokenHealth] = useState<FbTokenHealth | null>(null);
  const [metaAppId, setMetaAppId] = useState<string | null>(null);
  const [fbConfigId, setFbConfigId] = useState<string | null>(null);
  const [metaAppIdLoading, setMetaAppIdLoading] = useState(true);

  // Fetch META_APP_ID from an edge function on mount; retry once on failure
  const fetchMetaAppId = useCallback(async () => {
    setMetaAppIdLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("facebook-get-app-id");
      if (data?.app_id) {
        setMetaAppId(data.app_id);
        if (data.fb_config_id) setFbConfigId(data.fb_config_id);
      } else {
        console.warn("facebook-get-app-id returned no app_id:", error || data);
      }
    } catch (err) {
      console.warn("facebook-get-app-id failed:", err);
    } finally {
      setMetaAppIdLoading(false);
    }
  }, []);

  useEffect(() => { fetchMetaAppId(); }, [fetchMetaAppId]);

  const checkConnection = useCallback(async (): Promise<boolean> => {
    if (!user) {
      setIsConnected(false);
      setLoading(false);
      return false;
    }
    // Pull token health alongside the existence check so the UI can show a
    // "Reconnect Facebook" banner BEFORE the user notices things broken.
    // Scope by both org (SaaS multi-tenant) and user_id for backward compat.
    let query = supabase
      .from("facebook_tokens")
      .select("id, needs_reconnect, token_expires_at, last_refresh_error")
      .eq("user_id", user.id);
    // Strict org isolation: only this organization's token counts as connected,
    // so a Facebook connection in one org never bleeds into another.
    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }
    const { data } = await query.limit(1).maybeSingle();
    setIsConnected(!!data);

    if (data) {
      setTokenHealth({
        needs_reconnect: !!data.needs_reconnect,
        token_expires_at: data.token_expires_at ?? null,
        last_refresh_error: data.last_refresh_error ?? null,
      });
      const { data: statusData } = await supabase.functions.invoke("facebook-api", {
        body: { action: "status", organization_id: organizationId },
      });
      if (statusData) setStatus(statusData);
    } else {
      setTokenHealth(null);
    }
    setLoading(false);
    return !!data;
  }, [user, organizationId]);

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
      // Retry: the token row may still be committing right after the OAuth
      // redirect, so a single check can miss it and show "not connected".
      // Keep the optimistic connected state and re-verify a few times.
      (async () => {
        for (let i = 0; i < 6; i++) {
          const ok = await checkConnection();
          if (ok) return;
          setIsConnected(true); // hold optimistic state between retries
          await new Promise((r) => setTimeout(r, 1500));
        }
      })();
    } else if (params.get("fb_error")) {
      setConnecting(false);
      toast.error("Error al conectar con Facebook: " + params.get("fb_error"));
      const url = new URL(window.location.href);
      url.searchParams.delete("fb_error");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [checkConnection]);


  const connect = useCallback(async () => {
    if (!user) return;
    if (metaAppIdLoading) {
      toast.info("Cargando configuración de Meta, intenta en un momento...");
      return;
    }
    if (!metaAppId) {
      // Retry fetching app id before giving up
      await fetchMetaAppId();
      toast.error("No se pudo cargar la configuración de Meta. Verifica la conexión e intenta de nuevo.");
      return;
    }

    // MODERN FLOW — Facebook Login for Business with a config_id. Gives a clean,
    // per-connection asset selection (no cross-org page pre-selection). Falls back
    // to the classic OAuth redirect below when no config_id is configured.
    if (fbConfigId) {
      setConnecting(true);
      try {
        await loadFacebookSdk(metaAppId);
        const FB = (window as any).FB;
        if (!FB) throw new Error("No se pudo cargar el SDK de Facebook.");
        // The FB SDK rejects an async callback ("Expression is of type
        // asyncfunction, not function"), so the handler is a plain function that
        // kicks off the async work internally.
        FB.login(
          (response: any) => {
            void (async () => {
              const code = response?.authResponse?.code;
              if (!code) { setConnecting(false); toast.error("Conexión cancelada."); return; }
              try {
                const { data, error } = await supabase.functions.invoke("facebook-api", {
                  body: { action: "fb_exchange_code", code, organization_id: organizationId },
                });
                // supabase-js hides the edge function's real error behind a generic
                // "non-2xx status code" message; the actual reason (e.g. the Meta
                // token-exchange error) is in the response body. Surface it.
                if (error || data?.error) {
                  let detail = data?.error || error?.message || "Error al conectar Facebook";
                  try {
                    const ctx = (error as any)?.context;
                    if (ctx && typeof ctx.json === "function") {
                      const body = await ctx.json();
                      if (body?.error) detail = body.error;
                    }
                  } catch (_) { /* keep generic detail */ }
                  throw new Error(detail);
                }
                toast.success("Facebook conectado exitosamente");
                await checkConnection();
              } catch (e: any) {
                toast.error(e?.message || "Error al conectar Facebook");
              } finally { setConnecting(false); }
            })();
          },
          { config_id: fbConfigId, response_type: "code", override_default_response_type: true },
        );
      } catch (e: any) {
        setConnecting(false);
        toast.error(e?.message || "No se pudo iniciar la conexión.");
      }
      return;
    }

    setConnecting(true);

    // Request a single-use, server-bound nonce for the OAuth `state` param.
    // This prevents CSRF: previously we used the raw user_id, which an
    // attacker who knew the victim's UUID could spoof to plant their own
    // Facebook tokens under the victim's account.
    const { data: stateToken, error: stateErr } = await supabase.rpc(
      "create_oauth_state",
      { p_provider: "facebook", p_organization_id: organizationId ?? null },
    );
    if (stateErr || !stateToken) {
      setConnecting(false);
      console.warn("create_oauth_state failed, using UUID fallback:", stateErr);
      // Fallback: use user ID as state (less secure but functional while DB
      // migration propagates). The real CSRF-safe nonce will be used once the
      // oauth_state_tokens table is confirmed present on the remote DB.
      const fallbackState = user.id;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const redirectUri = encodeURIComponent(`${supabaseUrl}/functions/v1/facebook-oauth-callback`);
      const scopes = [
        "pages_show_list","pages_read_engagement","pages_manage_metadata",
        "pages_manage_ads","pages_messaging","leads_retrieval",
        "ads_read","ads_management","business_management",
        "instagram_basic","instagram_manage_messages",
        "instagram_manage_comments","instagram_manage_insights",
      ].join(",");
      const oauthUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${metaAppId}&redirect_uri=${redirectUri}&scope=${scopes}&state=${encodeURIComponent(fallbackState)}&response_type=code`;
      window.location.href = oauthUrl;
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
      // Ads (read + create/update campaigns, adsets, ads)
      "ads_read",
      "ads_management",
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
  }, [user, metaAppId, metaAppIdLoading, fetchMetaAppId, fbConfigId, organizationId, checkConnection]);

  const disconnect = useCallback(async () => {
    const { error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "disconnect", organization_id: organizationId },
    });
    if (!error) {
      setIsConnected(false);
      setStatus(null);
      toast.success("Facebook desconectado");
    }
  }, [organizationId]);

  const getPages = useCallback(async (): Promise<FbPage[]> => {
    const { data, error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "get_pages", organization_id: organizationId },
    });
    if (error) { toast.error("Error al obtener páginas"); return []; }
    if (data?.error) { toast.error(`Error páginas: ${data.error}`); return []; }
    return data.pages || [];
  }, [organizationId]);

  const savePages = useCallback(async (pages: { page_id: string; page_name: string; page_access_token: string }[]) => {
    const { data, error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "save_pages", pages, organization_id: organizationId },
    });
    if (error) { toast.error("Error al guardar páginas"); }
    else {
      const blocked = data?.blocked as { page_name: string }[] | undefined;
      if (blocked && blocked.length) {
        toast.warning(`${blocked.map(b => `"${b.page_name}"`).join(", ")} ya está conectada en otra empresa y no se conectó aquí.`);
      } else {
        toast.success("Páginas guardadas");
      }
    }
    checkConnection();
  }, [checkConnection, organizationId]);

  const getLeadForms = useCallback(async (pageId: string): Promise<FbForm[]> => {
    const { data, error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "get_lead_forms", page_id: pageId, organization_id: organizationId },
    });
    if (error) { toast.error("Error al obtener formularios"); return []; }
    return data.forms || [];
  }, [organizationId]);

  const saveLeadForms = useCallback(async (pageId: string, forms: { form_id: string; form_name: string; form_status?: string; pipeline_id?: string }[]) => {
    const { error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "save_lead_forms", page_id: pageId, forms, organization_id: organizationId },
    });
    if (error) toast.error("Error al guardar formularios");
    else toast.success("Formularios sincronizados");
    checkConnection();
  }, [checkConnection, organizationId]);

  const saveFieldMappings = useCallback(async (formId: string, mappings: { fb_field_name: string; contact_field: string; is_custom_field: boolean }[]) => {
    const { error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "save_field_mappings", form_id: formId, mappings, organization_id: organizationId },
    });
    if (error) toast.error("Error al guardar mapeo de campos");
    else toast.success("Mapeo de campos guardado");
  }, [organizationId]);

  const getConversations = useCallback(async (pageId: string) => {
    const { data, error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "get_conversations", page_id: pageId, organization_id: organizationId },
    });
    if (error) { toast.error("Error al obtener conversaciones"); return []; }
    return data.conversations || [];
  }, [organizationId]);

  const getAdAccounts = useCallback(async (): Promise<FbAdAccount[]> => {
    const { data, error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "get_ad_accounts", organization_id: organizationId },
    });
    if (error) { toast.error("Error al obtener cuentas publicitarias"); return []; }
    return data.ad_accounts || [];
  }, [organizationId]);

  const importCampaigns = useCallback(async (adAccountId: string) => {
    const { data, error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "get_campaigns", ad_account_id: adAccountId, organization_id: organizationId },
    });
    if (error) { toast.error("Error al importar campañas"); return null; }
    toast.success(`${data.total} campañas importadas`);
    checkConnection();
    return data;
  }, [checkConnection]);

  const updateCampaignStatus = useCallback(async (
    campaignId: string,
    newStatus: "ACTIVE" | "PAUSED"
  ): Promise<boolean> => {
    const { data, error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "update_campaign_status", campaign_id: campaignId, new_status: newStatus },
    });
    if (error || !data?.success) {
      toast.error(error?.message || "Error al actualizar la campaña");
      return false;
    }
    toast.success(newStatus === "ACTIVE" ? "Campaña activada" : "Campaña pausada");
    return true;
  }, []);

  const updateEntityStatus = useCallback(async (
    entityId: string,
    entityType: "campaign" | "adset" | "ad",
    newStatus: "ACTIVE" | "PAUSED"
  ): Promise<boolean> => {
    const { data, error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "update_entity_status", entity_id: entityId, entity_type: entityType, new_status: newStatus },
    });
    if (error || !data?.success) {
      toast.error(error?.message || "Error al actualizar");
      return false;
    }
    const labels: Record<string, string> = { campaign: "Campaña", adset: "Ad Set", ad: "Anuncio" };
    toast.success(`${labels[entityType]} ${newStatus === "ACTIVE" ? "activado/a" : "pausado/a"}`);
    return true;
  }, []);

  const importAdsStructure = useCallback(async (adAccountId: string): Promise<{ adsets: number; ads: number } | null> => {
    const { data, error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "get_ads_structure", ad_account_id: adAccountId },
    });
    if (error) { toast.error("Error al importar estructura de anuncios"); return null; }
    toast.success(`${data.adsets} ad sets y ${data.ads} anuncios importados`);
    return data;
  }, []);

  const fetchLeads = useCallback(async (formId: string, pageId: string) => {
    const { data, error } = await supabase.functions.invoke("facebook-api", {
      body: { action: "fetch_leads", form_id: formId, page_id: pageId, organization_id: organizationId },
    });
    if (error) { toast.error("Error al importar leads"); return null; }
    const imported = data?.imported || { contacts: 0, updated: 0, deals: 0 };
    if ((imported.contacts || 0) + (imported.updated || 0) > 0) {
      toast.success(`${imported.contacts} nuevos, ${imported.updated || 0} actualizados`);
    } else {
      toast.info("No se encontraron leads nuevos para importar");
    }
    return data;
  }, [organizationId]);

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
    metaAppIdLoading,
    connect, disconnect, checkConnection,
    getPages, savePages,
    getLeadForms, saveLeadForms, saveFieldMappings,
    getConversations,
    getAdAccounts, importCampaigns, fetchLeads,
    subscribeLeadgen,
    updateCampaignStatus,
    updateEntityStatus,
    importAdsStructure,
  };
}
