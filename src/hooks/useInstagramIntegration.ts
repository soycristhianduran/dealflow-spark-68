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

interface IgStatus {
  connected: boolean;
  account?: IgAccount;
  conversations_count?: number;
  comments_count?: number;
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
      toast.success(`Instagram @${account.ig_username} conectado`);
      await checkStatus();
    } catch (e: any) {
      toast.error("Error al conectar Instagram: " + e.message);
    } finally {
      setConnecting(false);
    }
  }, [checkStatus]);

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
    refresh: checkStatus,
  };
}
