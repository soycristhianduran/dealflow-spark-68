import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { formatMoney } from "@/lib/money";
import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useParams, useNavigate } from "react-router-dom";
import { useWorkspace } from "@/hooks/useWorkspace";
import { InstagramIcon, MessengerIcon } from "@/components/icons/BrandIcons";
import { ContactSocialThread } from "@/components/crm/ContactSocialThread";
import { LostReasonDialog, WonBudgetDialog } from "@/components/crm/CloseLeadDialogs";
import { Phone, Mail, ArrowLeft, MessageCircle, Calendar, MapPin, Megaphone, BarChart3, Loader2, Trash2, Cake, Pencil, Check, X, Plus, Settings2, KanbanSquare, Trophy, XCircle, Copy, Building2, FileText, Globe, Radio, Eye, Package } from "lucide-react";
import { AdPreviewDialog } from "@/components/crm/AdPreviewDialog";
import { ActivityTimeline } from "@/components/crm/ActivityTimeline";
import { CreateMeetingDialog } from "@/components/crm/CreateMeetingDialog";
import { AILeadAnalysisCard } from "@/components/crm/AILeadAnalysisCard";
import { ContactWhatsAppThread } from "@/components/crm/ContactWhatsAppThread";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmptyState } from "@/components/ui/empty-state";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

// Normalize a single raw custom_fields value to a plain string.
// Handles two storage formats:
//   - Flat (current):  "some text" | 42 | true
//   - Object (legacy): { id, type, value, label }
function normalizeCustomFieldValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && !Array.isArray(v) && "value" in (v as object)) {
    return String((v as { value?: unknown }).value ?? "");
  }
  return String(v);
}

// Normalize ALL custom_fields on a contact record to flat strings.
// Called every time a contact is loaded into state so that all render
// paths always receive plain strings — no renderer has to know the format.
function normalizeContact(data: any): any {
  if (!data) return data;
  const cf = data.custom_fields;
  if (!cf || typeof cf !== "object" || Array.isArray(cf)) return data;
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(cf as Record<string, unknown>)) {
    const s = normalizeCustomFieldValue(v);
    if (s !== "") flat[k] = s;
  }
  return { ...data, custom_fields: flat };
}

// Human-readable Spanish labels for raw meeting enums (stored in English).
const MEETING_STATUS_ES: Record<string, string> = {
  scheduled: "Programada",
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No asistió",
};
const MEETING_TYPE_ES: Record<string, string> = {
  video_call: "Videollamada",
  in_person: "Presencial",
  phone_call: "Llamada",
};

export default function ContactDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { path } = useWorkspace();
  const { canDeleteContacts, canEditContacts, canSeeBudget } = usePermissions();
  const { organizationId, defaultCurrency } = useOrganizationContext();
  const [contact, setContact] = useState<any>(null);
  const [fieldDefs, setFieldDefs] = useState<{ id: string; key: string; label: string; field_type: string; options: string[] | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [meetingDialogOpen, setMeetingDialogOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<any | null>(null);
  const [editingContact, setEditingContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [editForm, setEditForm] = useState<{
    first_name: string; last_name: string; primary_phone: string; primary_email: string;
    birthday: string; company_name: string; city: string; country: string; notes: string; language: string; preferred_channel: string;
    customFields: Record<string, any>; newFieldKey: string; newFieldValue: string;
    newFieldType: string; newFieldOptions: string;
  }>({
    first_name: "", last_name: "", primary_phone: "", primary_email: "", birthday: "",
    company_name: "", city: "", country: "", notes: "", language: "", preferred_channel: "",
    customFields: {}, newFieldKey: "", newFieldValue: "", newFieldType: "text", newFieldOptions: "",
  });
  // Inline pipeline state — Kommo-style, always editable without entering global edit mode
  const [ppl, setPpl] = useState({ pipeline_id: "", stage_id: "", budget: "", budget_currency: "USD", expected_close_date: "" });
  const [pplDirty, setPplDirty] = useState(false);
  const [savingPpl, setSavingPpl] = useState(false);
  const [budgetEditing, setBudgetEditing] = useState(false);
  const [wonProductName, setWonProductName] = useState<string | null>(null);
  const [stagePickerOpen, setStagePickerOpen] = useState(false);
  const [adPreviewOpen, setAdPreviewOpen] = useState(false);
  const [savingStage, setSavingStage] = useState(false);
  const [wonDlg, setWonDlg] = useState<{ stageId: string; pipelineId: string; stageName: string } | null>(null);
  const [wonAmt, setWonAmt] = useState("");
  const [wonCur, setWonCur] = useState("USD");
  const [pickerPipelineId, setPickerPipelineId] = useState("");
  const [stagesForPicker, setStagesForPicker] = useState<{ id: string; name: string; color: string; order: number }[]>([]);
  const [activeTab, setActiveTab] = useState("timeline");
  // Linked social chat (IG/Messenger) for the channel-aware quick action
  const [socialChat, setSocialChat] = useState<{ channel: "ig" | "ms"; convId: string; lastAt: string } | null>(null);
  useEffect(() => {
    if (!id) { setSocialChat(null); return; }
    (async () => {
      const [{ data: ig }, { data: ms }] = await Promise.all([
        supabase.from("instagram_conversations").select("id, last_message_at").eq("contact_id", id).order("last_message_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("messenger_conversations").select("id, last_message_at").eq("contact_id", id).order("last_message_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (ig && ms) {
        setSocialChat(new Date(ig.last_message_at) >= new Date(ms.last_message_at)
          ? { channel: "ig", convId: ig.id, lastAt: ig.last_message_at }
          : { channel: "ms", convId: ms.id, lastAt: ms.last_message_at });
      } else if (ig) setSocialChat({ channel: "ig", convId: ig.id, lastAt: ig.last_message_at });
      else if (ms) setSocialChat({ channel: "ms", convId: ms.id, lastAt: ms.last_message_at });
      else setSocialChat(null);
    })();
  }, [id]);

  // Pipeline state for stage dropdowns (loaded on demand when editing)
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [stagesForPipeline, setStagesForPipeline] = useState<{ id: string; name: string; color: string; order: number }[]>([]);

  const startEditing = () => {
    setEditForm({
      first_name: contact?.first_name || "",
      last_name: contact?.last_name || "",
      primary_phone: contact?.primary_phone || "",
      primary_email: contact?.primary_email || "",
      birthday: contact?.birthday || "",
      company_name: contact?.company_name || "",
      city: contact?.city || "",
      country: contact?.country || "",
      notes: contact?.notes || "",
      language: contact?.language || "",
      preferred_channel: contact?.preferred_channel || "",
      // Pass custom_fields values through as flat strings (normalizeContact already
      // guarantees they are strings by the time startEditing() is called).
      // addCustomField() still creates full {id,type,value,label} objects for
      // new fields — saveContactInfo() handles both formats.
      customFields: { ...(contact?.custom_fields || {}) },
      newFieldKey: "", newFieldValue: "", newFieldType: "text", newFieldOptions: "",
    });
    setEditingContact(true);
  };

  const addCustomField = () => {
    const label = editForm.newFieldKey.trim();
    if (!label) return;
    const slug = label.toLowerCase().replace(/\s+/g, "_");
    let fieldData: any;
    fieldData = {
      id: `cf_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
      type: editForm.newFieldType,
      value: editForm.newFieldValue,
      label,
      ...((editForm.newFieldType === "select" || editForm.newFieldType === "multiselect") && editForm.newFieldOptions
        ? { options: editForm.newFieldOptions.split(",").map((o: string) => o.trim()).filter(Boolean) }
        : {}),
    };
    setEditForm(p => ({
      ...p,
      customFields: { ...p.customFields, [slug]: fieldData },
      newFieldKey: "", newFieldValue: "", newFieldType: "text", newFieldOptions: "",
    }));
  };

  const removeCustomField = (key: string) => {
    setEditForm(p => {
      const next = { ...p.customFields };
      delete next[key];
      return { ...p, customFields: next };
    });
  };

  const cancelEditing = () => {
    setEditingContact(false);
  };

  const saveContactInfo = async () => {
    if (!id) return;
    setSavingContact(true);
    const fullName = [editForm.first_name.trim(), editForm.last_name.trim()].filter(Boolean).join(" ") || contact.full_name;
    const { error } = await supabase.from("contacts").update({
      first_name: editForm.first_name.trim() || null,
      last_name: editForm.last_name.trim() || null,
      full_name: fullName,
      primary_phone: editForm.primary_phone.trim() || null,
      primary_email: editForm.primary_email.trim() || null,
      birthday: editForm.birthday || null,
      company_name: editForm.company_name.trim() || null,
      city: editForm.city.trim() || null,
      country: editForm.country.trim() || null,
      notes: editForm.notes.trim() || null,
      language: editForm.language.trim() || null,
      preferred_channel: editForm.preferred_channel.trim() || null,
      custom_fields: (() => {
        // Save only non-empty values as flat key→value (new format)
        const flat: Record<string, string> = {};
        Object.entries(editForm.customFields).forEach(([k, v]) => {
          const val = typeof v === "object" && v !== null ? String((v as { value?: unknown }).value ?? "") : String(v ?? "");
          if (val !== "") flat[k] = val;
        });
        return Object.keys(flat).length > 0 ? flat : null;
      })(),
    }).eq("id", id);
    if (error) {
      toast.error(t("contactDetailPage.saveError") + error.message);
    } else {
      toast.success(t("contactDetailPage.leadUpdated"));
      const { data } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
      setContact(normalizeContact(data));
      setEditingContact(false);
    }
    setSavingContact(false);
  };

  // Load org-level custom field definitions
  useEffect(() => {
    if (!organizationId) return;
    supabase
      .from("custom_field_definitions")
      .select("id, key, label, field_type, options")
      .eq("organization_id", organizationId)
      .order("position", { ascending: true })
      .then(({ data }) => setFieldDefs(data || []));
  }, [organizationId]);

  const fetchRelated = async () => {
    if (!id) return;
    const [t, m, a, cl] = await Promise.all([
      supabase.from("tasks").select("*").eq("contact_id", id),
      supabase.from("meetings").select("*").eq("contact_id", id).order("start_at", { ascending: false }),
      supabase.from("activities").select("*").eq("related_entity_id", id).order("created_at", { ascending: false }),
      supabase.from("call_logs")
        .select("id, status, duration_seconds, ai_summary, temperature, organization_id, created_at")
        .eq("contact_id", id)
        .order("created_at", { ascending: false }),
    ]);
    setTasks(t.data || []);
    setMeetings(m.data || []);

    // Merge call_logs into the activities timeline as synthetic "call" events
    const callActivities = (cl.data || []).map((log: any) => {
      const statusLabel: Record<string, string> = {
        completed: t("contactDetailPage.callStatusCompleted"), no_answer: t("contactDetailPage.callStatusNoAnswer"), failed: t("contactDetailPage.callStatusFailed"),
        initiated: t("contactDetailPage.callStatusInitiated"), in_progress: t("contactDetailPage.callStatusInProgress"), cancelled: t("contactDetailPage.callStatusCancelled"),
      };
      const status = statusLabel[log.status] ?? log.status;
      const min = log.duration_seconds != null ? Math.floor(log.duration_seconds / 60) : null;
      const sec = log.duration_seconds != null ? String(log.duration_seconds % 60).padStart(2, "0") : null;
      const dur = min != null ? ` · ${min}:${sec}` : "";
      const summary = log.ai_summary ? ` — ${log.ai_summary}` : "";
      return {
        id: `call-${log.id}`,
        related_entity_type: "contact",
        related_entity_id: id,
        event_type: "call",
        summary: `${t("contactDetailPage.aiCallLabel")}${dur} · ${status}${summary}`,
        created_at: log.created_at,
        organization_id: log.organization_id,
      };
    });

    // Deduplicate: skip call_log entries that already have an activities record
    // within 60 seconds (i.e. written by vapi-webhook or cron-sync-calls).
    const existingCallTimestamps = (a.data || [])
      .filter((x: any) => x.event_type === "call")
      .map((x: any) => new Date(x.created_at).getTime());

    const newCallActivities = callActivities.filter((x) => {
      const t = new Date(x.created_at).getTime();
      return !existingCallTimestamps.some((et) => Math.abs(et - t) < 60_000);
    });

    setActivities([...(a.data || []), ...newCallActivities]);
  };

  const loadPipelinesForEdit = useCallback(async (currentPipelineId?: string) => {
    if (!organizationId) return;
    const { data } = await supabase.from("pipelines").select("id, name").eq("organization_id", organizationId).order("created_at", { ascending: true });
    setPipelines(data || []);
    if (currentPipelineId) {
      const { data: stages } = await supabase.from("pipeline_stages").select("id, name, color, order").eq("pipeline_id", currentPipelineId).order("order", { ascending: true });
      setStagesForPipeline(stages || []);
    }
  }, [organizationId]);

  const handlePipelineChange = async (newPipelineId: string) => {
    if (newPipelineId) {
      const { data: stages } = await supabase.from("pipeline_stages").select("id, name, color, order").eq("pipeline_id", newPipelineId).order("order", { ascending: true });
      setStagesForPipeline(stages || []);
    } else {
      setStagesForPipeline([]);
    }
  };

  // Sync ppl inline state from contact (runs on first load; manual sync after saves)
  useEffect(() => {
    if (!contact) return;
    setPpl({
      pipeline_id: contact.pipeline_id || "",
      stage_id: contact.stage_id || "",
      budget: contact.budget != null ? String(contact.budget) : "",
      budget_currency: contact.budget_currency || defaultCurrency,
      expected_close_date: contact.expected_close_date || "",
    });
    setPplDirty(false);
    // Eagerly load pipelines so the selects work without clicking Editar
    if (organizationId) {
      supabase.from("pipelines").select("id, name").eq("organization_id", organizationId).order("created_at", { ascending: true })
        .then(({ data }) => setPipelines(data || []));
    }
  }, [contact?.id, organizationId]);

  const updatePpl = (changes: Partial<typeof ppl>) => {
    setPpl(p => ({ ...p, ...changes }));
    setPplDirty(true);
  };

  const savePipelineFields = async () => {
    if (!id) return;
    setSavingPpl(true);
    const prevStageId = contact?.stage_id;
    const { error } = await supabase.from("contacts").update({
      pipeline_id: ppl.pipeline_id || null,
      stage_id: ppl.stage_id || null,
      budget: ppl.budget ? Number(ppl.budget) : null,
      budget_currency: ppl.budget_currency || defaultCurrency,
      expected_close_date: ppl.expected_close_date || null,
    }).eq("id", id);
    if (error) {
      toast.error("Error al guardar: " + error.message);
    } else {
      if (ppl.stage_id && ppl.stage_id !== prevStageId) {
        const stageName = stagesForPipeline.find(s => s.id === ppl.stage_id)?.name || "";
        await supabase.from("activities").insert({
          related_entity_type: "contact", related_entity_id: id,
          event_type: "stage_changed", event_source: "contact_detail_inline",
          summary: t("contactDetailPage.stageChangedTo", { stage: stageName }),
        });
        supabase.functions.invoke("analyze-contact-ai", { body: { contact_id: id } }).catch(() => {});
      }
      toast.success(t("contactDetailPage.pipelineUpdated"));
      const { data } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
      setContact(normalizeContact(data));
      setPpl({
        pipeline_id: data?.pipeline_id || "",
        stage_id: data?.stage_id || "",
        budget: data?.budget != null ? String(data.budget) : "",
        budget_currency: data?.budget_currency || defaultCurrency,
        expected_close_date: data?.expected_close_date || "",
      });
      setPplDirty(false);
      setBudgetEditing(false);
    }
    setSavingPpl(false);
  };

  // Sync picker state when popover opens
  useEffect(() => {
    if (!stagePickerOpen) return;
    const pid = contact?.pipeline_id || "";
    setPickerPipelineId(pid);
    setStagesForPicker(stagesForPipeline);
  }, [stagePickerOpen]);

  const handlePickerPipeline = async (pipelineId: string) => {
    setPickerPipelineId(pipelineId);
    if (pipelineId) {
      const { data } = await supabase.from("pipeline_stages").select("id, name, color, order")
        .eq("pipeline_id", pipelineId).order("order", { ascending: true });
      setStagesForPicker(data || []);
    } else {
      setStagesForPicker([]);
    }
  };

  // Quick stage change — saves immediately, no Guardar needed
  const isWonStageName = (n: string) => /ganad|won/i.test(n || "");
  const isLostStageName = (n: string) => /perdid|lost/i.test(n || "");
  const [lostDlg, setLostDlg] = useState<{ stageId: string; pipelineId: string } | null>(null);

  const quickChangeStage = async (newStageId: string, newPipelineId: string, budgetOverride?: { amount: number; currency: string; productId?: string | null }, lostReason?: string) => {
    if (!id || savingStage) return;
    const stageName = stagesForPicker.find(s => s.id === newStageId)?.name || "";
    // WON always confirms/updates the closing budget (prefilled with current).
    if (isWonStageName(stageName) && !budgetOverride) {
      setStagePickerOpen(false);
      setWonDlg({ stageId: newStageId, pipelineId: newPipelineId, stageName });
      setWonAmt(contact?.budget && Number(contact.budget) > 0 ? String(contact.budget) : "");
      setWonCur(contact?.budget_currency || defaultCurrency);
      return;
    }
    // LOST always captures a reason.
    if (isLostStageName(stageName) && !lostReason) {
      setStagePickerOpen(false);
      setLostDlg({ stageId: newStageId, pipelineId: newPipelineId });
      return;
    }
    setSavingStage(true);
    setStagePickerOpen(false);
    const prevStageId = contact?.stage_id;
    const update: Record<string, any> = { stage_id: newStageId, pipeline_id: newPipelineId };
    if (budgetOverride) { update.budget = budgetOverride.amount; update.budget_currency = budgetOverride.currency; update.lead_status = "won"; if (budgetOverride.productId !== undefined) update.won_product_id = budgetOverride.productId; }
    else if (lostReason) { update.lead_status = "lost"; update.lost_reason = lostReason; }
    else {
      // Moving to a NON-closing stage must reset the lead back to active — else
      // it stays 'won'/'lost' (stale badge + still counted as a sale in reports).
      update.lead_status = "active";
      update.won_product_id = null;
      update.lost_reason = null;
    }
    const { error } = await supabase.from("contacts").update(update).eq("id", id);
    if (error) {
      toast.error(error.message?.includes("BUDGET") || error.message?.includes("presupuesto") ? t("contactDetailPage.closingBudgetRequired") : t("contactDetailPage.stageChangeError") + error.message);
      setSavingStage(false);
      return;
    }
    if (!error) {
      const stageName = stagesForPicker.find(s => s.id === newStageId)?.name || "";
      if (newStageId !== prevStageId) {
        await supabase.from("activities").insert({
          related_entity_type: "contact", related_entity_id: id,
          event_type: "stage_changed", event_source: "contact_detail_inline",
          summary: t("contactDetailPage.stageChangedTo", { stage: stageName }),
        });
        supabase.functions.invoke("analyze-contact-ai", { body: { contact_id: id } }).catch(() => {});
        supabase.functions.invoke("automation-runner", {
          body: {
            action: "trigger_event",
            trigger_type: "contact_stage_changed",
            contact_id: id,
            trigger_data: { stage_id: newStageId, stage_name: stageName, pipeline_id: newPipelineId },
          },
        }).then(async () => {
          // Las automatizaciones pueden modificar el contacto (p. ej. presupuesto):
          // re-cargar la ficha cuando terminen para reflejarlo sin refrescar a mano.
          const { data: fresh } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
          if (fresh) {
            setContact(normalizeContact(fresh));
            // El widget de presupuesto/cierre lee del estado `ppl`, no de `contact`.
            setPpl(p => ({
              ...p,
              budget: fresh.budget != null ? String(fresh.budget) : "",
              budget_currency: fresh.budget_currency || p.budget_currency,
              expected_close_date: fresh.expected_close_date || p.expected_close_date,
            }));
          }
        }).catch(() => {});
      }
      const { data } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
      setContact(normalizeContact(data));
      setPpl(p => ({ ...p, stage_id: newStageId, pipeline_id: newPipelineId }));
      setStagesForPipeline(stagesForPicker);
      toast.success(t("contactDetailPage.stageToast", { stage: stageName }));
    }
    setSavingStage(false);
  };

  // Re-fetches the contact row.  Extracted so the realtime hook can call it.
    // Resolve the sold product's name for the "Producto vendido" card
  useEffect(() => {
    const pid = (contact as any)?.won_product_id;
    if (!pid) { setWonProductName(null); return; }
    supabase.from("products").select("name").eq("id", pid).maybeSingle()
      .then(({ data }) => setWonProductName(data?.name ?? null));
  }, [(contact as any)?.won_product_id]);

  const refetchContact = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
    setContact(normalizeContact(data));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    refetchContact().finally(() => setLoading(false));
    fetchRelated();
  }, [id, refetchContact]);

  // Pre-load stages when contact has a pipeline (for view-mode display)
  useEffect(() => {
    if (!contact?.pipeline_id) return;
    supabase.from("pipeline_stages").select("id, name, color, order")
      .eq("pipeline_id", contact.pipeline_id).order("order", { ascending: true })
      .then(({ data }) => setStagesForPipeline(data || []));
  }, [contact?.pipeline_id]);

  // ── Realtime: keep the page in sync with DB changes ──────────────────────
  // Contact row (score, status, etc.)
  useRealtimeRefresh({
    table: "contacts",
    filter: `id=eq.${id}`,
    channelKey: `contact-${id}`,
    onChange: refetchContact,
    enabled: !!id,
  });
  // Tasks (auto-created by AI, manual changes, etc.)
  useRealtimeRefresh({
    table: "tasks",
    filter: `contact_id=eq.${id}`,
    channelKey: `contact-tasks-${id}`,
    onChange: fetchRelated,
    enabled: !!id,
  });
  // Meetings
  useRealtimeRefresh({
    table: "meetings",
    filter: `contact_id=eq.${id}`,
    channelKey: `contact-meetings-${id}`,
    onChange: fetchRelated,
    enabled: !!id,
  });
  // Activities (timeline entries, new WhatsApp messages, etc.)
  useRealtimeRefresh({
    table: "activities",
    filter: `related_entity_id=eq.${id}`,
    channelKey: `contact-activities-${id}`,
    onChange: fetchRelated,
    enabled: !!id,
  });
  // Call logs — refresh timeline when a call status changes (e.g. initiated → completed)
  useRealtimeRefresh({
    table: "call_logs",
    filter: `contact_id=eq.${id}`,
    channelKey: `contact-call-logs-${id}`,
    onChange: fetchRelated,
    enabled: !!id,
  });

  if (loading) {
    return (
      <AppLayout>
        <AppHeader title={t("contactDetailPage.loading")} />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </main>
      </AppLayout>
    );
  }

  if (!contact) {
    return (
      <AppLayout>
        <AppHeader title={t("contactDetailPage.leadNotFound")} />
        <main className="flex-1 flex items-center justify-center flex-col gap-3">
          <p className="text-muted-foreground">{t("contactDetailPage.leadDoesNotExist")}</p>
          <Button variant="outline" onClick={() => navigate(path('/contacts'))}>{t("contactDetailPage.backToLeads")}</Button>
        </main>
      </AppLayout>
    );
  }

  const currentStage = stagesForPipeline.find(s => s.id === contact.stage_id);

  return (
    <AppLayout>
      <AppHeader
        title={contact.full_name}
        actions={
          <div className="flex items-center gap-2">
            {canDeleteContacts && <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" /> {t("contactDetailPage.delete")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("contactDetailPage.deleteLeadTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("contactDetailPage.deleteLeadDescPrefix")}<strong>{contact.full_name}</strong>{t("contactDetailPage.deleteLeadDescSuffix")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("contactDetailPage.cancel")}</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
                    const { error } = await supabase.from("contacts").delete().eq("id", id!);
                    if (error) { toast.error(t("contactDetailPage.deleteError") + error.message); return; }
                    toast.success(t("contactDetailPage.leadDeleted"));
                    navigate(path("/contacts"));
                  }}>
                    {t("contactDetailPage.delete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>}
            <Button variant="ghost" size="sm" onClick={() => navigate(path('/contacts'))} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> {t("contactDetailPage.back")}
            </Button>
          </div>
        }
      />
      <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4">
            <Card className="border-none shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-14 w-14">
                      <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                        {contact.full_name.split(' ').map((n: string) => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h2 className="text-lg font-bold text-foreground">{contact.full_name}</h2>
                      {contact.company_name && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Building2 className="h-3.5 w-3.5 shrink-0" />
                          {contact.company_name}
                        </p>
                      )}
                      {contact.created_at && (
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                          {t("contactDetailPage.enteredOn")} {new Date(contact.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {contact.lead_status === "won" && (
                          <Badge className="bg-green-500 text-white border-0 gap-1"><Trophy className="h-3 w-3" /> {t("contactDetailPage.won")}</Badge>
                        )}
                        {contact.lead_status === "lost" && (
                          <>
                            <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> {t("contactDetailPage.lost")}</Badge>
                            {contact.lost_reason && (
                              <span className="text-xs text-muted-foreground">· {contact.lost_reason}</span>
                            )}
                          </>
                        )}
                        {contact.pipeline_id && !canEditContacts && (
                          <div className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium">
                            {currentStage
                              ? <><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: currentStage.color }} />{currentStage.name}</>
                              : <span className="text-muted-foreground">{t("contactDetailPage.noStage")}</span>}
                          </div>
                        )}
                        {canEditContacts && (
                          <Popover open={stagePickerOpen} onOpenChange={setStagePickerOpen}>
                            <PopoverTrigger asChild>
                              <button className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors" disabled={savingStage}>
                                {savingStage
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : !contact.pipeline_id
                                    ? <span className="text-primary flex items-center gap-1"><Plus className="h-3.5 w-3.5" />{t("contactDetailPage.assignToPipeline")}</span>
                                    : currentStage
                                      ? <><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: currentStage.color }} />{currentStage.name}</>
                                      : <span className="text-muted-foreground">{t("contactDetailPage.noStage")}</span>
                                }
                                <svg className="h-3.5 w-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 9l6 6 6-6"/></svg>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-0" align="start">
                              {/* Pipeline selector */}
                              {pipelines.length > 0 && (
                                <div className="border-b p-1.5 space-y-0.5">
                                  {pipelines.map(pl => (
                                    <button
                                      key={pl.id}
                                      className={`w-full text-left px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center justify-between ${pickerPipelineId === pl.id ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground"}`}
                                      onClick={() => handlePickerPipeline(pl.id)}
                                    >
                                      {pl.name}
                                      {pickerPipelineId === pl.id && <Check className="h-3 w-3" />}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {/* Stages for selected pipeline */}
                              <div className="p-1">
                                {stagesForPicker.length === 0 ? (
                                  <p className="text-xs text-muted-foreground px-3 py-2">{t("contactDetailPage.selectPipeline")}</p>
                                ) : stagesForPicker.map(stage => (
                                  <button
                                    key={stage.id}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors text-left ${stage.id === contact.stage_id && pickerPipelineId === contact.pipeline_id ? "font-semibold" : ""}`}
                                    onClick={() => quickChangeStage(stage.id, pickerPipelineId)}
                                  >
                                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                                    {stage.name}
                                    {stage.id === contact.stage_id && pickerPipelineId === contact.pipeline_id && <Check className="h-3.5 w-3.5 ml-auto text-primary" />}
                                  </button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                    </div>
                  </div>
                  {!editingContact ? (
                    canEditContacts && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 px-2" onClick={startEditing}>
                        <Pencil className="h-3 w-3" /> {t("contactDetailPage.edit")}
                      </Button>
                    )
                  ) : (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={cancelEditing}>
                        <X className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="default" className="h-7 text-xs px-2 gap-1" onClick={saveContactInfo} disabled={savingContact}>
                        <Check className="h-3 w-3" /> {savingContact ? "..." : t("contactDetailPage.save")}
                      </Button>
                    </div>
                  )}
                </div>

                {editingContact ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-muted-foreground">{t("contactDetailPage.firstName")}</label>
                          <CopyIdBtn fieldId="first_name" />
                        </div>
                        <Input value={editForm.first_name} onChange={e => setEditForm(p => ({ ...p, first_name: e.target.value }))} className="h-8 text-sm mt-0.5" />
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-muted-foreground">{t("contactDetailPage.lastName")}</label>
                          <CopyIdBtn fieldId="last_name" />
                        </div>
                        <Input value={editForm.last_name} onChange={e => setEditForm(p => ({ ...p, last_name: e.target.value }))} className="h-8 text-sm mt-0.5" />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-muted-foreground">{t("contactDetailPage.phone")}</label>
                        <CopyIdBtn fieldId="primary_phone" />
                      </div>
                      <Input value={editForm.primary_phone} onChange={e => setEditForm(p => ({ ...p, primary_phone: e.target.value }))} className="h-8 text-sm mt-0.5" placeholder="+52 55 1234 5678" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-muted-foreground">{t("contactDetailPage.email")}</label>
                        <CopyIdBtn fieldId="primary_email" />
                      </div>
                      <Input type="email" value={editForm.primary_email} onChange={e => setEditForm(p => ({ ...p, primary_email: e.target.value }))} className="h-8 text-sm mt-0.5" placeholder={t("contactDetailPage.emailPlaceholder")} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-muted-foreground">{t("contactDetailPage.birthday")}</label>
                        <CopyIdBtn fieldId="birthday" />
                      </div>
                      <Input type="date" value={editForm.birthday} onChange={e => setEditForm(p => ({ ...p, birthday: e.target.value }))} className="h-8 text-sm mt-0.5" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" /> {t("contactDetailPage.company")}</label>
                      <Input value={editForm.company_name} onChange={e => setEditForm(p => ({ ...p, company_name: e.target.value }))} className="h-8 text-sm mt-0.5" placeholder={t("contactDetailPage.companyPlaceholder")} maxLength={120} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> {t("contactDetailPage.city")}</label>
                        <Input value={editForm.city} onChange={e => setEditForm(p => ({ ...p, city: e.target.value }))} className="h-8 text-sm mt-0.5" placeholder={t("contactDetailPage.cityPlaceholder")} maxLength={80} />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">{t("contactDetailPage.country")}</label>
                        <Input value={editForm.country} onChange={e => setEditForm(p => ({ ...p, country: e.target.value }))} className="h-8 text-sm mt-0.5" placeholder={t("contactDetailPage.countryPlaceholder")} maxLength={80} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground flex items-center gap-1"><Globe className="h-3 w-3" /> {t("contactDetailPage.language")}</label>
                      <Input value={editForm.language} onChange={e => setEditForm(p => ({ ...p, language: e.target.value }))} className="h-8 text-sm mt-0.5" placeholder={t("contactDetailPage.languagePlaceholder")} maxLength={40} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground flex items-center gap-1"><Radio className="h-3 w-3" /> {t("contactDetailPage.preferredChannel")}</label>
                      <Select value={editForm.preferred_channel || "__none__"} onValueChange={v => setEditForm(p => ({ ...p, preferred_channel: v === "__none__" ? "" : v }))}>
                        <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue placeholder={t("contactDetailPage.unspecified")} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">{t("contactDetailPage.unspecified")}</SelectItem>
                          <SelectItem value="whatsapp">WhatsApp</SelectItem>
                          <SelectItem value="instagram">Instagram</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="phone">{t("contactDetailPage.phone")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="h-3 w-3" /> {t("contactDetailPage.notes")}</label>
                      <Textarea value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} className="text-sm mt-0.5 min-h-[72px] resize-none" placeholder={t("contactDetailPage.notesPlaceholder")} maxLength={2000} />
                    </div>

                    {/* Custom fields — values only, schema managed in Settings → Campos */}
                    {fieldDefs.length > 0 && (
                      <div className="pt-1 border-t">
                        <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                          <Settings2 className="h-3 w-3" /> {t("contactDetailPage.customFields")}
                        </p>
                        <div className="space-y-1.5">
                          {fieldDefs.map(def => {
                            const raw = editForm.customFields?.[def.key];
                            const value = raw !== undefined && raw !== null
                              ? (typeof raw === "object" && raw !== null ? String((raw as { value?: unknown }).value ?? "") : String(raw))
                              : "";
                            const setVal = (newVal: string) => setEditForm(p => ({
                              ...p,
                              customFields: { ...p.customFields, [def.key]: newVal },
                            }));
                            return (
                              <div key={def.key} className="flex items-center gap-1.5">
                                <span className="text-xs text-muted-foreground w-24 truncate shrink-0">{def.label}</span>
                                {def.field_type === "boolean" ? (
                                  <div className="flex-1 flex items-center gap-2">
                                    <Switch checked={value === "true"} onCheckedChange={v => setVal(v ? "true" : "false")} />
                                    <span className="text-xs text-muted-foreground">{value === "true" ? t("contactDetailPage.yes") : t("contactDetailPage.no")}</span>
                                  </div>
                                ) : def.field_type === "select" ? (
                                  <Select value={value} onValueChange={setVal}>
                                    <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder={t("contactDetailPage.selectPlaceholder")} /></SelectTrigger>
                                    <SelectContent>{(def.options || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                                  </Select>
                                ) : (
                                  <Input
                                    type={def.field_type === "number" ? "number" : def.field_type === "date" ? "date" : "text"}
                                    value={value}
                                    onChange={e => setVal(e.target.value)}
                                    className="h-7 text-xs flex-1"
                                    placeholder="—"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-2">
                          {t("contactDetailPage.toAddFieldsGoTo")}{" "}
                          <button
                            className="underline hover:text-foreground"
                            onClick={() => navigate(path("/settings") + "?tab=campos")}
                          >
                            {t("contactDetailPage.settingsFields")}
                          </button>
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {contact.primary_phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-foreground">{contact.primary_phone}</span>
                      </div>
                    )}
                    {contact.primary_email && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-foreground">{contact.primary_email}</span>
                      </div>
                    )}
                    {(contact.city || contact.country) && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="text-foreground">{[contact.city, contact.country].filter(Boolean).join(', ')}</span>
                      </div>
                    )}
                    {contact.birthday && (
                      <div className="flex items-center gap-2 text-sm">
                        <Cake className="h-4 w-4 text-muted-foreground" />
                        <span className="text-foreground">{new Date(contact.birthday + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                      </div>
                    )}
                    {contact.language && (
                      <div className="flex items-center gap-2 text-sm">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span className="text-foreground">{contact.language}</span>
                      </div>
                    )}
                    {contact.preferred_channel && (
                      <div className="flex items-center gap-2 text-sm">
                        <Radio className="h-4 w-4 text-muted-foreground" />
                        <span className="text-foreground capitalize">{contact.preferred_channel}</span>
                      </div>
                    )}
                    {fieldDefs.length > 0 && (
                      <div className="pt-2 mt-1 border-t space-y-1.5">
                        {fieldDefs.map(def => {
                          const raw = (contact.custom_fields as Record<string, any>)?.[def.key];
                          const value = normalizeCustomFieldValue(raw);
                          let displayValue: React.ReactNode = value || <span className="text-muted-foreground/50">—</span>;
                          if (def.field_type === "boolean") displayValue = <Switch checked={value === "true"} disabled className="scale-75 origin-right" />;
                          else if (def.field_type === "date" && value) displayValue = new Date(value + "T12:00:00").toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
                          return (
                            <div key={def.key} className="flex items-start justify-between gap-2 text-sm">
                              <span className="text-muted-foreground shrink-0">{def.label}:</span>
                              <span className="text-foreground text-right">{displayValue}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Budget + close date panel */}
                    <div className="pt-3 mt-2 border-t space-y-2.5">
                      {pplDirty && (
                        <div className="flex justify-end">
                          <Button size="sm" variant="default" className="h-6 text-[10px] px-2 gap-1" onClick={savePipelineFields} disabled={savingPpl}>
                            {savingPpl ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                            {t("contactDetailPage.save")}
                          </Button>
                        </div>
                      )}

                      {/* Budget — visible solo si tiene permiso */}
                      {canSeeBudget(contact?.owner_id) && (
                        <div className="rounded-lg bg-primary/5 border border-primary/10 px-3 py-2.5">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">{t("contactDetailPage.budget")}</p>
                          {budgetEditing ? (
                            <div className="flex gap-1.5 items-center">
                              <Input
                                type="number" min={0} value={ppl.budget}
                                onChange={e => updatePpl({ budget: e.target.value })}
                                className="h-8 text-base font-bold flex-1"
                                autoFocus
                                placeholder="0"
                                onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setBudgetEditing(false); }}
                                onBlur={() => setBudgetEditing(false)}
                              />
                              <Select value={ppl.budget_currency} onValueChange={v => updatePpl({ budget_currency: v })}>
                                <SelectTrigger className="h-8 w-16 text-xs shrink-0"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {["USD","EUR","MXN","COP","ARS","BRL"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          ) : (
                            <button
                              className="w-full text-left flex items-baseline gap-1.5 group"
                              onClick={() => canEditContacts && setBudgetEditing(true)}
                              title={canEditContacts ? t("contactDetailPage.clickToEditBudget") : undefined}
                            >
                              <span className="text-2xl font-bold text-foreground leading-none">
                                {ppl.budget ? formatMoney(Number(ppl.budget), ppl.budget_currency || defaultCurrency) : "—"}
                              </span>
                              <span className="text-sm text-muted-foreground">{ppl.budget_currency || defaultCurrency}</span>
                              {canEditContacts && <Pencil className="h-3 w-3 text-muted-foreground ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Product / service sold (won leads only) */}
                      {contact.lead_status === "won" && wonProductName && (
                        <div className="rounded-lg border bg-green-50/60 dark:bg-green-950/20 border-green-200 dark:border-green-900 p-2.5">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{t("contactDetailPage.soldProduct")}</p>
                          <p className="text-sm font-semibold text-green-700 dark:text-green-400 flex items-center gap-1.5">
                            <Package className="h-3.5 w-3.5 shrink-0" /> {wonProductName}
                          </p>
                        </div>
                      )}

                      {/* Expected close date */}
                      <div>
                        <label className="text-xs text-muted-foreground">{t("contactDetailPage.expectedCloseDate")}</label>
                        <Input
                          type="date" value={ppl.expected_close_date}
                          onChange={e => updatePpl({ expected_close_date: e.target.value })}
                          className="h-8 text-xs mt-0.5"
                        />
                      </div>
                    </div>

                    {/* Quick actions — always visible inside the card */}
                    <div className="pt-3 mt-2 border-t grid grid-cols-4 gap-1.5">
                      <Button
                        variant="outline" size="sm"
                        className="flex-col h-auto py-2 gap-1 text-xs"
                        disabled={!contact.primary_phone}
                        onClick={() => { if (contact.primary_phone) window.location.href = `tel:${contact.primary_phone.replace(/[^+\d]/g, "")}`; }}
                        title={contact.primary_phone ? t("contactDetailPage.callTo", { phone: contact.primary_phone }) : t("contactDetailPage.noPhone")}
                      >
                        <Phone className="h-4 w-4" />
                        {t("contactDetailPage.call")}
                      </Button>
                      {/* Channel-aware chat: leads born on IG/Messenger open THAT
                          conversation; phone leads keep the WhatsApp thread tab. */}
                      {socialChat && !contact.primary_phone ? (
                        <Button
                          variant="outline" size="sm"
                          className="flex-col h-auto py-2 gap-1 text-xs"
                          onClick={() => setActiveTab("social")}
                          title={t("contactDetailPage.openSocialChat")}
                        >
                          {socialChat.channel === "ig" ? <InstagramIcon size={16} /> : <MessengerIcon size={16} />}
                          {socialChat.channel === "ig" ? "Instagram" : "Messenger"}
                        </Button>
                      ) : (
                        <Button
                          variant="outline" size="sm"
                          className="flex-col h-auto py-2 gap-1 text-xs"
                          disabled={!contact.primary_phone && !socialChat}
                          onClick={() => {
                            if (contact.primary_phone) setActiveTab("whatsapp");
                            else if (socialChat) setActiveTab("social");
                          }}
                          title={contact.primary_phone ? t("contactDetailPage.openWhatsAppChat") : t("contactDetailPage.noPhone")}
                        >
                          <MessageCircle className="h-4 w-4" />
                          WhatsApp
                        </Button>
                      )}
                      <Button
                        variant="outline" size="sm"
                        className="flex-col h-auto py-2 gap-1 text-xs"
                        disabled={!contact.primary_email}
                        onClick={() => { if (contact.primary_email) { const s = t("contactDetailPage.emailGreeting", { name: contact.full_name?.split(" ")[0] || "" }).trim(); window.location.href = `mailto:${contact.primary_email}?subject=${encodeURIComponent(s)}`; } }}
                        title={contact.primary_email ? t("contactDetailPage.emailTo", { email: contact.primary_email }) : t("contactDetailPage.noEmail")}
                      >
                        <Mail className="h-4 w-4" />
                        {t("contactDetailPage.email")}
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        className="flex-col h-auto py-2 gap-1 text-xs"
                        onClick={() => setMeetingDialogOpen(true)}
                      >
                        <Calendar className="h-4 w-4" />
                        {t("contactDetailPage.schedule")}
                      </Button>
                    </div>
                  </div>
                )}


                {/* AI-powered conversation analysis */}
                <div className="mt-4">
                  <AILeadAnalysisCard
                    contactId={id!}
                    onAnalysisComplete={(newScore) =>
                      setContact((prev: any) => prev ? { ...prev, score: newScore } : prev)
                    }
                  />
                </div>

                {contact.tags && contact.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {contact.tags.map((tag: string) => (
                      <Badge key={tag} variant="secondary">{tag}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Notes card — always visible if has notes, otherwise click-to-add */}
            <NotesCard
              contactId={id!}
              notes={contact.notes}
              canEdit={canEditContacts}
              onUpdated={() => supabase.from("contacts").select("*").eq("id", id!).maybeSingle().then(({ data }) => data && setContact(normalizeContact(data)))}
            />

          </div>

          <div className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="timeline">{t("contactDetailPage.tabTimeline")}</TabsTrigger>
                <TabsTrigger value="info">{t("contactDetailPage.tabInfo")}</TabsTrigger>
                <TabsTrigger value="tasks">{t("contactDetailPage.tabTasks")} ({tasks.length})</TabsTrigger>
                <TabsTrigger value="meetings">{t("contactDetailPage.tabMeetings")} ({meetings.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="timeline" className="mt-4">
                <ActivityTimeline
                  activities={activities}
                  onAddNote={async (text) => {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) {
                      toast.error(t("contactDetailPage.sessionExpired"));
                      return;
                    }
                    const { error } = await supabase.from("activities").insert({
                      related_entity_type: "contact",
                      related_entity_id: id,
                      event_type: "note",
                      event_source: "manual",
                      summary: text,
                      created_by: user.id,
                    });
                    if (error) {
                      toast.error(t("contactDetailPage.noteSaveError") + error.message);
                      return;
                    }
                    toast.success(t("contactDetailPage.noteSaved"));
                    fetchRelated();
                  }}
                />
              </TabsContent>

              <TabsContent value="info" className="mt-4 space-y-4">
                {(() => {
                  // Labels for known source values
                  const sourceLabel = (s: string) => ({
                    facebook_ads: "Facebook Ads",
                    facebook_lead_ads: "Facebook Lead Ads",
                    whatsapp: "WhatsApp",
                    instagram: "Instagram",
                    api: "Landing Page",
                    web: "Web",
                    manual: "Manual",
                  }[s] ?? s);

                  // Extract additional sources from merge activity log
                  const mergedSources = activities
                    .filter((a: any) => a.event_source === "merge")
                    .map((a: any) => {
                      const m = a.summary?.match(/origen secundario:\s*([^,]+)/i);
                      return m ? m[1].trim() : null;
                    })
                    .filter(Boolean) as string[];

                  const hasOriginData = contact.source || mergedSources.length > 0;

                  return hasOriginData || contact.campaign || contact.adset || contact.ad || contact.landing_page ? (
                    <Card className="border-none shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <Megaphone className="h-3.5 w-3.5" /> {t("contactDetailPage.originAndCampaign")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                          {/* Origen — primary + any merged sources */}
                          {hasOriginData && (
                            <div className="col-span-2 flex flex-col gap-1.5">
                              <span className="text-[11px] font-medium text-muted-foreground">{t("contactDetailPage.origin")}</span>
                              <div className="flex flex-wrap gap-1.5 items-center">
                                {contact.source && (
                                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 border border-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                                    {sourceLabel(contact.source)}
                                  </span>
                                )}
                                {mergedSources.map((src, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 border border-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
                                    <span className="opacity-60">+</span> {sourceLabel(src)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {contact.campaign     && <InfoItem label={t("contactDetailPage.campaign")} value={contact.campaign} />}
                          {contact.adset        && <InfoItem label={t("contactDetailPage.adSet")} value={contact.adset} />}
                          {contact.ad && (
                            <div className="flex flex-col gap-1">
                              <span className="text-[11px] font-medium text-muted-foreground">{t("contactDetailPage.ad")}</span>
                              {contact.meta_ad_id ? (
                                <button
                                  onClick={() => setAdPreviewOpen(true)}
                                  className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline text-left flex items-center gap-1.5 group"
                                >
                                  <span className="truncate">{contact.ad}</span>
                                  <Eye className="h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100" />
                                </button>
                              ) : (
                                <span className="text-sm">{contact.ad}</span>
                              )}
                            </div>
                          )}
                          {contact.landing_page && <InfoItem label="Landing Page" value={contact.landing_page} />}
                        </div>
                      </CardContent>
                    </Card>
                  ) : null;
                })()}

                {(contact.utm_source || contact.utm_medium || contact.utm_campaign || contact.utm_term || contact.utm_content) && (
                  <Card className="border-none shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <BarChart3 className="h-3.5 w-3.5" /> {t("contactDetailPage.trafficSource")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        {contact.utm_source   && <InfoItem label={t("contactDetailPage.utmSource")}   value={contact.utm_source} />}
                        {contact.utm_medium   && <InfoItem label={t("contactDetailPage.utmMedium")}    value={contact.utm_medium} />}
                        {contact.utm_campaign && <InfoItem label={t("contactDetailPage.utmCampaign")} value={contact.utm_campaign} />}
                        {contact.utm_content  && <InfoItem label={t("contactDetailPage.utmContent")} value={contact.utm_content} />}
                        {contact.utm_term     && <InfoItem label={t("contactDetailPage.utmTerm")}    value={contact.utm_term} />}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card className="border-none shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("contactDetailPage.dates")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <InfoItem label={t("contactDetailPage.birthday")} value={contact.birthday ? new Date(contact.birthday + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) : undefined} />
                      <InfoItem label={t("contactDetailPage.created")} value={new Date(contact.created_at).toLocaleString()} />
                      <InfoItem label={t("contactDetailPage.updated")} value={new Date(contact.updated_at).toLocaleString()} />
                      <InfoItem label={t("contactDetailPage.lastContact")} value={contact.last_contact_at ? new Date(contact.last_contact_at).toLocaleString() : undefined} />
                      <InfoItem label={t("contactDetailPage.nextAction")} value={contact.next_action_at ? new Date(contact.next_action_at).toLocaleString() : undefined} />
                    </div>
                  </CardContent>
                </Card>

                <CustomFieldsCard
                  customFields={contact.custom_fields}
                  contactId={contact.id}
                  fieldDefs={fieldDefs}
                  onUpdated={() => {
                    supabase.from("contacts").select("*").eq("id", id!).single()
                      .then(({ data }) => { if (data) setContact(normalizeContact(data)); });
                  }}
                />

              </TabsContent>

              {socialChat && (
                <TabsContent value="social" className="mt-4">
                  <ContactSocialThread
                    channel={socialChat.channel}
                    conversationId={socialChat.convId}
                    contactName={contact.full_name}
                  />
                </TabsContent>
              )}

              {contact.primary_phone && (
                <TabsContent value="whatsapp" className="mt-4">
                  <ContactWhatsAppThread
                    phone={contact.primary_phone}
                    contactId={contact.id}
                    contactName={contact.full_name}
                  />
                </TabsContent>
              )}

              <TabsContent value="tasks" className="mt-4 space-y-2">
                {tasks.length > 0 ? tasks.map(task => (
                  <div key={task.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                    <div className={`h-2 w-2 rounded-full shrink-0 ${
                      task.priority === 'urgent' ? 'bg-destructive' :
                      task.priority === 'high' ? 'bg-warning' : 'bg-primary'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{task.title}</p>
                      <p className="text-xs text-muted-foreground">{task.due_date}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{task.status}</Badge>
                  </div>
                )) : (
                  <EmptyState
                    variant="tasks"
                    title={t("contactDetailPage.noTasksTitle")}
                    description={t("contactDetailPage.noTasksDesc")}
                  />
                )}
              </TabsContent>

              <TabsContent value="meetings" className="mt-4 space-y-3">
                {meetings.length > 0 ? meetings.map(meeting => (
                  <Card
                    key={meeting.id}
                    className="border shadow-sm cursor-pointer transition-shadow hover:shadow-md hover:border-primary/40"
                    onClick={() => { setEditingMeeting(meeting); setMeetingDialogOpen(true); }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">{meeting.title}</p>
                        <span className="text-xs text-muted-foreground shrink-0">{t("contactDetailPage.editMeetingHint")}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(meeting.start_at).toLocaleString("es", { dateStyle: "full", timeStyle: "short" })} – {new Date(meeting.end_at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="outline" className="text-xs">{MEETING_STATUS_ES[meeting.status] || meeting.status}</Badge>
                        {meeting.meeting_type && <Badge variant="secondary" className="text-xs">{MEETING_TYPE_ES[meeting.meeting_type] || meeting.meeting_type}</Badge>}
                      </div>
                    </CardContent>
                  </Card>
                )) : (
                  <EmptyState
                    variant="meetings"
                    title={t("contactDetailPage.noMeetingsTitle")}
                    description={t("contactDetailPage.noMeetingsDesc")}
                  />
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      <CreateMeetingDialog
        open={meetingDialogOpen}
        onOpenChange={(o) => { setMeetingDialogOpen(o); if (!o) setEditingMeeting(null); }}
        onCreated={fetchRelated}
        defaultContactId={id}
        defaultDate={editingMeeting ? new Date(editingMeeting.start_at) : undefined}
        defaultStartTime={editingMeeting ? new Date(editingMeeting.start_at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", hour12: false }) : undefined}
        defaultEndTime={editingMeeting ? new Date(editingMeeting.end_at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", hour12: false }) : undefined}
        editingMeeting={editingMeeting ? {
          id: editingMeeting.id,
          title: editingMeeting.title,
          meeting_type: editingMeeting.meeting_type,
          location_or_link: editingMeeting.location_or_link,
          notes: editingMeeting.notes,
          contact_id: editingMeeting.contact_id,
          status: editingMeeting.status,
          google_event_id: editingMeeting.google_event_id ?? null,
          advisor_id: editingMeeting.advisor_id ?? null,
        } : undefined}
      />

      <AdPreviewDialog
        open={adPreviewOpen}
        onOpenChange={setAdPreviewOpen}
        adId={(contact as any)?.meta_ad_id ?? null}
        adName={(contact as any)?.ad ?? null}
      />

      {/* Closing budget + product — required when moving a lead to a WON stage */}
      <WonBudgetDialog
        open={!!wonDlg}
        onOpenChange={(o) => { if (!o) setWonDlg(null); }}
        contactName={contact?.full_name}
        initialAmount={contact?.budget && Number(contact.budget) > 0 ? Number(contact.budget) : null}
        initialCurrency={contact?.budget_currency || defaultCurrency}
        initialProductId={(contact as any)?.won_product_id ?? null}
        onConfirm={async (amount, currency, productId) => {
          const d = wonDlg;
          if (!d) return;
          setWonDlg(null);
          await quickChangeStage(d.stageId, d.pipelineId, { amount, currency, productId });
        }}
      />
      <LostReasonDialog
        open={!!lostDlg}
        onOpenChange={(o) => { if (!o) setLostDlg(null); }}
        onConfirm={async (reason) => {
          if (lostDlg) await quickChangeStage(lostDlg.stageId, lostDlg.pipelineId, undefined, reason);
          setLostDlg(null);
        }}
      />
    </AppLayout>
  );
}

function CopyIdBtn({ fieldId }: { fieldId: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="text-muted-foreground hover:text-foreground transition-colors"
      title={t("contactDetailPage.copyId", { id: fieldId })}
      onClick={() => {
        navigator.clipboard.writeText(fieldId);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function InfoItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground mt-0.5">{value || '—'}</p>
    </div>
  );
}

type FieldDefMini = { id: string; key: string; label: string; field_type: string; options: string[] | null };

// ---------------------------------------------------------------------------
// NotesCard — inline-editable notes for a contact
// ---------------------------------------------------------------------------
function NotesCard({ contactId, notes, canEdit, onUpdated }: {
  contactId: string;
  notes?: string | null;
  canEdit: boolean;
  onUpdated: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(notes || "");
  const [saving, setSaving] = useState(false);

  // Sync when prop changes (e.g. after parent refresh)
  useEffect(() => { setValue(notes || ""); }, [notes]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("contacts")
      .update({ notes: value.trim() || null })
      .eq("id", contactId);
    if (error) toast.error(t("contactDetailPage.notesSaveError"));
    else { toast.success(t("contactDetailPage.notesSaved")); onUpdated(); }
    setSaving(false);
    setEditing(false);
  };

  const handleCancel = () => {
    setValue(notes || "");
    setEditing(false);
  };

  return (
    <Card className="border-none shadow-sm mt-4">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" /> {t("contactDetailPage.notes")}
          </CardTitle>
          {canEdit && !editing && (
            <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2" onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3" /> {notes ? t("contactDetailPage.edit") : t("contactDetailPage.add")}
            </Button>
          )}
          {editing && (
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={handleCancel}>
                <X className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="default" className="h-6 text-xs px-2 gap-1" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Check className="h-3 w-3" /> {t("contactDetailPage.save")}</>}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        {editing ? (
          <Textarea
            value={value}
            onChange={e => setValue(e.target.value)}
            className="text-sm resize-none min-h-[96px]"
            placeholder={t("contactDetailPage.notesPlaceholder")}
            maxLength={2000}
            autoFocus
          />
        ) : notes ? (
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{notes}</p>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-3 cursor-pointer hover:text-foreground transition-colors"
            onClick={() => canEdit && setEditing(true)}>
            {canEdit ? t("contactDetailPage.clickToAddNotes") : t("contactDetailPage.noNotes")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CustomFieldsCard({ customFields, contactId, fieldDefs, onUpdated }: {
  customFields?: Record<string, any> | null;
  contactId: string;
  fieldDefs: FieldDefMini[];
  onUpdated: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Initialize values from contact's custom_fields, defaulting to "" for defined fields
  useEffect(() => {
    const base: Record<string, string> = {};
    fieldDefs.forEach(def => {
      const v = customFields?.[def.key];
      base[def.key] = normalizeCustomFieldValue(v);
    });
    // Also keep any extra fields not in definitions (legacy/api data)
    if (customFields && typeof customFields === "object") {
      Object.entries(customFields).forEach(([k, v]) => {
        if (!(k in base)) base[k] = normalizeCustomFieldValue(v);
      });
    }
    setValues(base);
  }, [customFields, fieldDefs]);

  const handleSave = async () => {
    setSaving(true);
    // Only save non-empty values
    const toSave: Record<string, string> = {};
    Object.entries(values).forEach(([k, v]) => { if (v !== "") toSave[k] = v; });
    const { error } = await supabase.from("contacts").update({ custom_fields: Object.keys(toSave).length > 0 ? toSave : null }).eq("id", contactId);
    if (error) toast.error(t("contactDetailPage.fieldsSaveError"));
    else { toast.success(t("contactDetailPage.fieldsSaved")); onUpdated(); }
    setSaving(false);
    setEditing(false);
  };

  const setValue = (key: string, val: string) => setValues(prev => ({ ...prev, [key]: val }));

  const allKeys = [
    ...fieldDefs.map(d => d.key),
    ...Object.keys(customFields || {}).filter(k => !fieldDefs.find(d => d.key === k)),
  ];

  if (fieldDefs.length === 0 && !customFields) return null;

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Settings2 className="h-3.5 w-3.5" /> {t("contactDetailPage.customFields")}
          </CardTitle>
          {!editing ? (
            <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2" onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3" /> {t("contactDetailPage.edit")}
            </Button>
          ) : (
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => { setEditing(false); }}>
                <X className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="default" className="h-6 text-xs px-2 gap-1" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Check className="h-3 w-3" /> {t("contactDetailPage.save")}</>}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {allKeys.map(key => {
          const def = fieldDefs.find(d => d.key === key);
          const label = def?.label ?? key.replace(/_/g, " ");
          const type = def?.field_type ?? "text";
          const opts = def?.options ?? [];
          const val = values[key] ?? "";

          return (
            <div key={key} className="flex items-center gap-2">
              {editing ? (
                <>
                  <span className="text-xs text-muted-foreground w-28 truncate shrink-0">{label}</span>
                  {type === "boolean" ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Switch checked={val === "true"} onCheckedChange={v => setValue(key, v ? "true" : "false")} />
                      <span className="text-xs text-muted-foreground">{val === "true" ? t("contactDetailPage.yes") : t("contactDetailPage.no")}</span>
                    </div>
                  ) : type === "select" ? (
                    <Select value={val} onValueChange={v => setValue(key, v)}>
                      <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder={t("contactDetailPage.selectPlaceholder")} /></SelectTrigger>
                      <SelectContent>{opts.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={type === "number" ? "number" : type === "date" ? "date" : "text"}
                      value={val}
                      onChange={e => setValue(key, e.target.value)}
                      className="h-7 text-xs flex-1"
                    />
                  )}
                </>
              ) : (
                <div className="flex-1 flex justify-between items-start gap-2">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm font-medium text-foreground text-right">
                    {type === "boolean"
                      ? (val === "true" ? t("contactDetailPage.yes") : val === "false" ? t("contactDetailPage.no") : "—")
                      : val || <span className="text-muted-foreground/50">—</span>}
                  </p>
                </div>
              )}
            </div>
          );
        })}

        {fieldDefs.length === 0 && (!customFields || Object.keys(customFields).length === 0) && (
          <p className="text-xs text-muted-foreground text-center py-2">
            {t("contactDetailPage.defineFieldsHint")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
