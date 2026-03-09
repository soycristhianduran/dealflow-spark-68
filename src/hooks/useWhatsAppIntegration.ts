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
  const [saving, setSaving] = useState(false);

  const isConnected = !!config?.is_active;

  const fetchConfig = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from("whatsapp_configs")
        .select("id, phone_number_id, waba_id, display_phone, business_name, webhook_verified, is_active, created_at")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      setConfig(data);
    } catch (e: any) {
      console.error("Error fetching WA config:", e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const saveConfig = async (values: {
    phone_number_id: string;
    waba_id: string;
    access_token: string;
    display_phone?: string;
    business_name?: string;
  }) => {
    if (!user) return;
    setSaving(true);
    try {
      if (config) {
        // Update existing
        const { error } = await supabase
          .from("whatsapp_configs")
          .update({
            phone_number_id: values.phone_number_id,
            waba_id: values.waba_id,
            access_token: values.access_token,
            display_phone: values.display_phone || null,
            business_name: values.business_name || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", config.id);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from("whatsapp_configs")
          .insert({
            user_id: user.id,
            phone_number_id: values.phone_number_id,
            waba_id: values.waba_id,
            access_token: values.access_token,
            display_phone: values.display_phone || null,
            business_name: values.business_name || null,
          });
        if (error) throw error;
      }
      toast.success("WhatsApp configurado correctamente");
      await fetchConfig();
    } catch (e: any) {
      toast.error("Error al guardar configuración: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    if (!config) return;
    try {
      await supabase
        .from("whatsapp_configs")
        .update({ is_active: false })
        .eq("id", config.id);
      setConfig(null);
      toast.success("WhatsApp desconectado");
    } catch (e: any) {
      toast.error("Error al desconectar: " + e.message);
    }
  };

  const sendMessage = async (phone: string, message: string, contactId?: string) => {
    const { data, error } = await supabase.functions.invoke("send-whatsapp", {
      body: { phone, message, contact_id: contactId },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  return {
    config,
    isConnected,
    loading,
    saving,
    saveConfig,
    disconnect,
    sendMessage,
    refreshConfig: fetchConfig,
  };
}
