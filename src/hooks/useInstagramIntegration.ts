import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface IgAccount {
  id: string;
  ig_user_id: string;
  ig_username: string | null;
  profile_picture_url: string | null;
  page_name: string | null;
}

export interface IgAvailableAccount {
  ig_user_id: string;
  ig_username: string;
  profile_picture_url: string | null;
  followers_count?: number;
  page_id: string;
  page_name: string;
  page_access_token: string;
}

export interface IgMedia {
  id: string;
  caption: string | null;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | string;
  permalink: string;
  preview_url: string | null;
  timestamp: string;
  comments_count: number;
  like_count: number;
}

interface IgStatus {
  connected: boolean;
  account?: IgAccount;
  conversations_count?: number;
  comments_count?: number;
}

export interface IgDiagnosis {
  account: {
    ig_user_id: string;
    ig_username: string | null;
    page_id: string;
    page_name: string | null;
  };
  checks: {
    page_subscribed_to_messages: boolean;
    page_subscribed_to_messaging_postbacks: boolean;
    page_subscribed_to_comments: boolean;
    token_has_instagram_basic: boolean;
    token_has_instagram_manage_messages: boolean;
    token_has_pages_messaging: boolean;
    token_has_pages_manage_metadata: boolean;
  };
  subscribed_fields: string[];
  token_permissions: Array<{ permission: string; status: string }>;
  page_subscriptions_error: string | null;
  permissions_error: string | null;
  resubscribe_result: any;
}

export function useInstagramIntegration() {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<IgStatus | null>(null);

  const checkStatus = useCallback(async () => {
    if (!user) {
      setIsConnected(false);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.functions.invoke("instagram-api", {
      body: { action: "status" },
    });
    if (error || data?.error) {
      console.error("IG status error:", data?.error || error?.message);
      setIsConnected(false);
    } else {
      setStatus(data);
      setIsConnected(!!data?.connected);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // List IG accounts the user could connect (via their connected FB pages)
  const listAvailableAccounts = useCallback(async (): Promise<IgAvailableAccount[]> => {
    const { data, error } = await supabase.functions.invoke("instagram-api", {
      body: { action: "list_available_ig_accounts" },
    });
    if (error || data?.error) {
      toast.error("Error al listar cuentas de Instagram: " + (data?.error || error?.message));
      return [];
    }
    return data.accounts || [];
  }, []);

  const connectAccount = useCallback(async (account: IgAvailableAccount) => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("instagram-api", {
        body: { action: "connect_account", ...account },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      // The connect succeeds even if the webhook subscription failed — we
      // store the account but warn loudly so the user knows DMs won't arrive
      // until they fix the underlying permission issue (typically
      // instagram_manage_messages not granted on the Meta App).
      if (data?.subscribe_warning) {
        toast.warning(
          `Instagram @${account.ig_username} conectado, pero los DMs no llegarán: ${data.subscribe_warning}. Usa el botón "Diagnosticar" en el modal para más detalles.`,
          { duration: 12000 },
        );
      } else {
        toast.success(`Instagram @${account.ig_username} conectado`);
      }
      await checkStatus();
    } catch (e: any) {
      toast.error("Error al conectar Instagram: " + e.message);
    } finally {
      setConnecting(false);
    }
  }, [checkStatus]);

  /**
   * Run a deep diagnostic against Meta: which webhook fields is the page
   * actually subscribed to? what permissions does our token have?  Returns
   * a structured report so the UI can render an actionable checklist.
   * Also re-attempts the `messages` subscription if it's missing.
   */
  const diagnose = useCallback(async (): Promise<IgDiagnosis | null> => {
    const { data, error } = await supabase.functions.invoke("instagram-api", {
      body: { action: "diagnose" },
    });
    if (error || data?.error) {
      toast.error("Error al diagnosticar: " + (data?.error || error?.message));
      return null;
    }
    return data as IgDiagnosis;
  }, []);

  /**
   * Backfill @username / name / avatar for any conversation that still
   * shows the raw IGSID.  Used by the "Actualizar" button so existing
   * conversations get prettified without requiring a new incoming DM.
   */
  const resolveUnresolvedParticipants = useCallback(async (): Promise<void> => {
    const { data, error } = await supabase.functions.invoke("instagram-api", {
      body: { action: "resolve_unresolved_participants" },
    });
    if (error || data?.error) {
      // Silent in the common case where there's nothing to resolve.
      console.warn("resolve_unresolved_participants:", data?.error || error?.message);
      return;
    }
    if (data?.resolved > 0) {
      toast.success(`Se resolvieron ${data.resolved} participante(s) de Instagram`);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const { error, data } = await supabase.functions.invoke("instagram-api", {
      body: { action: "disconnect" },
    });
    if (error || data?.error) {
      toast.error("Error al desconectar: " + (data?.error || error?.message));
      return;
    }
    setIsConnected(false);
    setStatus({ connected: false });
    toast.success("Instagram desconectado");
  }, []);

  const sendDm = useCallback(async (params: {
    recipient_id: string;
    text: string;
    conversation_id?: string;
  }) => {
    const { data, error } = await supabase.functions.invoke("instagram-api", {
      body: { action: "send_dm", ...params },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message);
    return data;
  }, []);

  const replyComment = useCallback(async (commentId: string, text: string) => {
    const { data, error } = await supabase.functions.invoke("instagram-api", {
      body: { action: "reply_comment", comment_id: commentId, text },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message);
    return data;
  }, []);

  const listMedia = useCallback(async (limit = 24): Promise<IgMedia[]> => {
    const { data, error } = await supabase.functions.invoke("instagram-api", {
      body: { action: "list_media", limit },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message);
    return data.media || [];
  }, []);

  return {
    isConnected,
    loading,
    connecting,
    status,
    listAvailableAccounts,
    connectAccount,
    disconnect,
    sendDm,
    replyComment,
    listMedia,
    diagnose,
    resolveUnresolvedParticipants,
    refresh: checkStatus,
  };
}
