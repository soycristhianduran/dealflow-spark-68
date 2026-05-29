import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface WaTemplateButton {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
}

export interface WhatsAppTemplate {
  id: string;
  template_id?: string | null;   // Meta's numeric template ID (null for DRAFTs)
  waba_id?: string | null;
  name: string;
  category: string;
  language: string;
  status: string;
  rejection_reason?: string | null;
  header_type?: string | null;
  header_text?: string | null;
  body_text: string;
  footer_text?: string | null;
  buttons?: WaTemplateButton[];
  created_at: string;
  updated_at: string;
}

export interface TemplateHeader {
  type?: string;
  text?: string;
  media_id?: string;
}

export interface CreateTemplateParams {
  name: string;
  category: string;
  language: string;
  header?: TemplateHeader | null;
  body_text: string;
  variable_examples?: string[];
  footer?: string;
  buttons?: WaTemplateButton[];
}

export function useWhatsAppTemplates() {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Load from local DB (fast, always works)
  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const { data: local } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .order("created_at", { ascending: false });
      setTemplates(local || []);
    } catch (e: any) {
      toast.error("Error al cargar plantillas: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Sync from Meta API (requires valid token — call explicitly)
  const syncFromMeta = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-api", {
        body: { action: "list_templates" },
      });
      if (data?.error) throw new Error(data.error);
      if (error) throw new Error(error.message);
      // Reload from DB after sync
      const { data: local } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .order("created_at", { ascending: false });
      setTemplates(local || []);
      toast.success("Plantillas sincronizadas");
    } catch (e: any) {
      toast.error("Error al sincronizar con Meta: " + e.message);
      // Still show local data
      await fetchTemplates();
    } finally {
      setLoading(false);
    }
  }, [fetchTemplates]);

  const createTemplate = useCallback(async (params: CreateTemplateParams) => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-api", {
        body: { action: "create_template", ...params },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success("Plantilla enviada a Meta ✓  — Haz clic en 'Sincronizar' para ver el estado actualizado.");
      await fetchTemplates();
      return data;
    } catch (e: any) {
      toast.error("Error al crear plantilla: " + e.message);
      throw e;
    } finally {
      setCreating(false);
    }
  }, [fetchTemplates]);

  const deleteTemplate = useCallback(async (name: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-api", {
        body: { action: "delete_template", name },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success("Plantilla eliminada");
      setTemplates(prev => prev.filter(t => t.name !== name));
    } catch (e: any) {
      toast.error("Error al eliminar: " + e.message);
    }
  }, []);

  const updateTemplate = useCallback(async (params: {
    template_id: string;
    name: string;
    header?: TemplateHeader | null;
    body_text: string;
    variable_examples?: string[];
    footer?: string;
    buttons?: WaTemplateButton[];
  }) => {
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-api", {
        body: { action: "update_template", ...params },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success("Plantilla actualizada ✓  — Haz clic en 'Sincronizar' para ver el estado de Meta.");
      await fetchTemplates();
      return data;
    } catch (e: any) {
      toast.error("Error al actualizar: " + e.message);
      throw e;
    }
  }, [fetchTemplates]);

  return { templates, loading, creating, fetchTemplates, syncFromMeta, createTemplate, deleteTemplate, updateTemplate };
}
