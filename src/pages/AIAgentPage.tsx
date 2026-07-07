/**
 * AIAgentPage — configure and monitor the 24/7 AI conversational agent.
 *
 * The agent auto-responds to WhatsApp and Instagram DMs using the business
 * context configured here.  A "pause" toggle per conversation lets vendors
 * take over manually at any time.
 */

import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Bot, Loader2, Save, MessageCircle, Instagram, Zap, Info, CalendarClock, Upload, Trash2, Image as ImageIcon, FileText, Eye, Plus, X } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import { useTranslation } from "react-i18next";
import { MessengerIcon } from "@/components/icons/BrandIcons";

// Reminder offset (minutes) ↔ human label helpers
const OFFSET_PRESETS: { value: number; label: string }[] = [
  { value: 15, label: "15 minutos antes" },
  { value: 30, label: "30 minutos antes" },
  { value: 60, label: "1 hora antes" },
  { value: 120, label: "2 horas antes" },
  { value: 180, label: "3 horas antes" },
  { value: 360, label: "6 horas antes" },
  { value: 720, label: "12 horas antes" },
  { value: 1440, label: "1 día antes" },
  { value: 2880, label: "2 días antes" },
  { value: 4320, label: "3 días antes" },
  { value: 10080, label: "1 semana antes" },
];
const offsetLabel = (min: number) => OFFSET_PRESETS.find(o => o.value === min)?.label
  || (min % 1440 === 0 ? `${min / 1440} día(s) antes` : min % 60 === 0 ? `${min / 60} hora(s) antes` : `${min} min antes`);

type DayHours = { enabled: boolean; start: string; end: string };
type WorkingHours = Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", DayHours>;

interface AgentConfig {
  id?: string;
  is_active: boolean;
  auto_qualify: boolean;
  agent_name: string;
  business_name: string;
  business_description: string;
  products: string;
  faqs: string;
  tone: string;
  region: string;
  escalation_response: string;
  off_topic_response: string;
  channels: { whatsapp: boolean; instagram: boolean; messenger?: boolean };
  appointments_enabled: boolean;
  reminders_enabled: boolean;
  reminders: { minutes: number; template: string | null; lang: string }[];
  appointment_duration_min: number;
  working_hours: WorkingHours;
  meeting_address: string;
  appointment_modality: "both" | "virtual" | "presencial";
  appointment_slot_capacity: { enabled: boolean; rules: { days: number[]; hours: string[]; capacity: number }[] };
  appointments_paid: boolean;
  payment_link: string;
  payment_info: string;
  require_payment_proof: boolean;
  payment_account_info: string;
}

const DEFAULT_HOURS: WorkingHours = {
  mon: { enabled: true, start: "09:00", end: "18:00" },
  tue: { enabled: true, start: "09:00", end: "18:00" },
  wed: { enabled: true, start: "09:00", end: "18:00" },
  thu: { enabled: true, start: "09:00", end: "18:00" },
  fri: { enabled: true, start: "09:00", end: "18:00" },
  sat: { enabled: false, start: "09:00", end: "13:00" },
  sun: { enabled: false, start: "09:00", end: "13:00" },
};

const DAY_LABELS: { key: keyof WorkingHours; label: string }[] = [
  { key: "mon", label: "Lunes" }, { key: "tue", label: "Martes" }, { key: "wed", label: "Miércoles" },
  { key: "thu", label: "Jueves" }, { key: "fri", label: "Viernes" }, { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
];

interface MediaItem {
  id: string;
  name: string;
  description: string | null;
  file_url: string;
  file_type: string;
  mime: string | null;
}

const DEFAULT_CONFIG: AgentConfig = {
  is_active: false,
  auto_qualify: false,
  agent_name: "Asistente",
  business_name: "",
  business_description: "",
  products: "",
  faqs: "",
  tone: "amigable",
  region: "",
  escalation_response: "¡Claro! Un momento, voy a comunicarte con uno de nuestros asesores para que te ayuden mejor. 😊",
  off_topic_response: "Lo siento, no tengo información sobre ese tema. Un asesor te ayudará en breve.",
  channels: { whatsapp: true, instagram: false, messenger: false },
  appointments_enabled: false,
  reminders_enabled: true,
  reminders: [
    { minutes: 1440, template: null, lang: "es" },
    { minutes: 60, template: null, lang: "es" },
  ],
  appointment_duration_min: 30,
  appointment_slot_capacity: { enabled: false, rules: [{ days: [1,2,3,4,5], hours: ["09:00","10:00","11:00","12:00"], capacity: 2 }] },
  working_hours: DEFAULT_HOURS,
  meeting_address: "",
  appointment_modality: "both",
  appointments_paid: false,
  payment_link: "",
  payment_info: "",
  require_payment_proof: true,
  payment_account_info: "",
};

export default function AIAgentPage() {
  const { organizationId } = useOrganizationContext();
  const { subscription } = useSubscription();
  const { canAccessPowerFeatures: canEditAgent } = usePermissions();
  const [config, setConfig] = useState<AgentConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [conversationsThisMonth, setConversationsThisMonth] = useState(0);
  const [hasWhatsApp, setHasWhatsApp] = useState<boolean | null>(null);
  const [hasInstagram, setHasInstagram] = useState<boolean | null>(null);
  const [waReceiving, setWaReceiving] = useState<boolean | null>(null);
  const [waSendOk, setWaSendOk] = useState<boolean | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [newMediaName, setNewMediaName] = useState("");
  const [newMediaDesc, setNewMediaDesc] = useState("");
  const { templates: waTemplates, fetchTemplates } = useWhatsAppTemplates();
  const [newOffset, setNewOffset] = useState("60");
  const { t } = useTranslation();

  useEffect(() => {
    if (!organizationId) { setLoading(false); return; }
    loadConfig();
    loadUsage();
    loadMedia();
    fetchTemplates();
    // Check if org has an active WhatsApp number
    supabase
      .from("whatsapp_configs")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setHasWhatsApp(!!data));
    // Instagram connected?
    supabase
      .from("instagram_accounts")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setHasInstagram(!!data));
    // WhatsApp actually receiving? (any inbound message ever) + can send (last
    // outgoing not failed) — quick health signals so "agent on but silent" is visible.
    supabase
      .from("whatsapp_messages")
      .select("direction")
      .eq("organization_id", organizationId)
      .eq("direction", "incoming")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setWaReceiving(!!data));
    supabase
      .from("whatsapp_messages")
      .select("status")
      .eq("organization_id", organizationId)
      .eq("direction", "outgoing")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setWaSendOk(data ? data.status !== "failed" : null));
  }, [organizationId]);

  async function loadConfig() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("ai_agent_configs")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (data) {
        setConfig({
          id: data.id,
          is_active: data.is_active ?? false,
          auto_qualify: data.auto_qualify ?? false,
          agent_name: data.agent_name ?? "Asistente",
          business_name: data.business_name ?? "",
          business_description: data.business_description ?? "",
          products: data.products ?? "",
          faqs: data.faqs ?? "",
          tone: data.tone ?? "amigable",
          region: data.region ?? "",
          escalation_response: data.escalation_response ?? DEFAULT_CONFIG.escalation_response,
          off_topic_response: data.off_topic_response ?? DEFAULT_CONFIG.off_topic_response,
          channels: data.channels ?? { whatsapp: true, instagram: false, messenger: false },
          appointments_enabled: data.appointments_enabled ?? false,
          reminders_enabled: data.reminders_enabled ?? true,
          reminders: (Array.isArray(data.reminders) && data.reminders.length)
            ? (data.reminders as AgentConfig["reminders"])
            : (Array.isArray(data.reminder_offsets) ? data.reminder_offsets as number[] : [1440, 60])
                .map((m: number) => ({ minutes: m, template: data.reminder_template_name || null, lang: data.reminder_template_lang || "es" })),
          appointment_duration_min: data.appointment_duration_min ?? 30,
          appointment_slot_capacity: (() => {
            const c: any = data.appointment_slot_capacity;
            const toHHMM = (arr: any[]): string[] => (arr || []).map((h: any) =>
              typeof h === "number" ? `${String(h).padStart(2, "0")}:00` : String(h));
            const DEF = { days: [1,2,3,4,5], hours: ["09:00","10:00","11:00","12:00"], capacity: 2 };
            if (!c) return { enabled: false, rules: [DEF] };
            if (Array.isArray(c.rules)) return { enabled: !!c.enabled, rules: (c.rules.length ? c.rules : [DEF]).map((r: any) => ({ days: r.days ?? [], hours: toHHMM(r.hours), capacity: r.capacity ?? 2 })) };
            return { enabled: !!c.enabled, rules: [{ days: c.days ?? [1,2,3,4,5], hours: toHHMM(c.hours), capacity: c.capacity ?? 2 }] };
          })(),
          working_hours: (data.working_hours as WorkingHours) ?? DEFAULT_HOURS,
          meeting_address: data.meeting_address ?? "",
          appointment_modality: (data.appointment_modality as AgentConfig["appointment_modality"]) ?? "both",
          appointments_paid: data.appointments_paid ?? false,
          payment_link: data.payment_link ?? "",
          payment_info: data.payment_info ?? "",
          require_payment_proof: data.require_payment_proof ?? true,
          payment_account_info: data.payment_account_info ?? "",
        });
      }
    } catch (err) {
      console.warn("Error loading agent config:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadUsage() {
    try {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const { data } = await supabase
        .from("usage_counters")
        .select("ai_agent_credits_used")
        .eq("organization_id", organizationId)
        .eq("period_start", monthStart)
        .maybeSingle();
      setConversationsThisMonth(data?.ai_agent_credits_used ?? 0);
    } catch (err) {
      console.warn("Error loading agent usage:", err);
    }
  }

  async function loadMedia() {
    if (!organizationId) return;
    const { data } = await supabase
      .from("agent_media")
      .select("id, name, description, file_url, file_type, mime")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    setMedia((data as MediaItem[]) || []);
  }

  // WhatsApp rejects images over 5 MB (error 131053). Compress/resize images on
  // upload so the agent can always send them — resize to max 1920px and step the
  // JPEG quality down until it's safely under the limit.
  async function compressImageIfNeeded(file: File): Promise<File> {
    const MAX = 4_500_000; // stay safely under WhatsApp's 5 MB
    if (!file.type.startsWith("image/") || file.size <= MAX) return file;
    try {
      const img = await createImageBitmap(file);
      let { width, height } = img;
      const maxDim = 1920;
      if (Math.max(width, height) > maxDim) {
        const s = maxDim / Math.max(width, height);
        width = Math.round(width * s); height = Math.round(height * s);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      const toBlob = (q: number) => new Promise<Blob | null>(r => canvas.toBlob(r, "image/jpeg", q));
      let q = 0.85, blob = await toBlob(q);
      while (blob && blob.size > MAX && q > 0.4) { q -= 0.15; blob = await toBlob(q); }
      if (!blob) return file;
      return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
    } catch { return file; }
  }

  async function handleUploadMedia(rawFile: File) {
    if (!organizationId) return;
    if (!newMediaName.trim()) { toast.error(t("aIAgentPage.nameFileFirst")); return; }
    if (rawFile.size > 16 * 1024 * 1024 && !rawFile.type.startsWith("image/")) { toast.error(t("aIAgentPage.fileExceeds16mb")); return; }
    setUploading(true);
    try {
      const file = await compressImageIfNeeded(rawFile);
      const ext = file.name.split(".").pop() || "bin";
      const path = `${organizationId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("agent-media").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("agent-media").getPublicUrl(path);
      const fileType = file.type.startsWith("image/") ? "image" : "document";
      const { error: insErr } = await supabase.from("agent_media").insert({
        organization_id: organizationId,
        name: newMediaName.trim(),
        description: newMediaDesc.trim() || null,
        file_url: pub.publicUrl,
        file_type: fileType,
        mime: file.type || null,
      });
      if (insErr) throw insErr;
      toast.success(t("aIAgentPage.fileAddedToLibrary"));
      setNewMediaName(""); setNewMediaDesc("");
      loadMedia();
    } catch (err: any) {
      toast.error(t("aIAgentPage.uploadError") + (err?.message || t("aIAgentPage.tryAgain")));
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteMedia(id: string) {
    const { error } = await supabase.from("agent_media").update({ is_active: false }).eq("id", id);
    if (error) { toast.error(t("aIAgentPage.couldNotDelete")); return; }
    setMedia(prev => prev.filter(m => m.id !== id));
  }

  async function handleSave() {
    if (!organizationId) return;
    setSaving(true);
    try {
      const payload = {
        organization_id: organizationId,
        is_active: config.is_active,
        auto_qualify: config.auto_qualify,
        agent_name: config.agent_name.trim() || "Asistente",
        business_name: config.business_name.trim() || null,
        business_description: config.business_description.trim() || null,
        products: config.products.trim() || null,
        faqs: config.faqs.trim() || null,
        tone: config.tone,
        region: config.region.trim() || null,
        escalation_response: config.escalation_response.trim(),
        off_topic_response: config.off_topic_response.trim(),
        channels: config.channels,
        appointments_enabled: config.appointments_enabled,
        reminders_enabled: config.reminders_enabled,
        reminders: config.reminders,
        appointment_duration_min: config.appointment_duration_min,
        appointment_slot_capacity: config.appointment_slot_capacity,
        working_hours: config.working_hours,
        meeting_address: config.meeting_address.trim() || null,
        appointment_modality: config.appointment_modality,
        appointments_paid: config.appointments_paid,
        payment_link: config.payment_link.trim() || null,
        payment_info: config.payment_info.trim() || null,
        require_payment_proof: config.require_payment_proof,
        payment_account_info: config.payment_account_info.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("ai_agent_configs")
        .upsert(payload, { onConflict: "organization_id" });

      if (error) throw error;
      toast.success(t("aIAgentPage.configSaved"));
    } catch (err: any) {
      console.warn("Error saving agent config:", err);
      toast.error(t("aIAgentPage.configSaveError"));
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) {
    setConfig(prev => ({ ...prev, [key]: value }));
  }

  if (loading) {
    return (
      <AppLayout>
        <AppHeader title={t("aIAgentPage.aiAgent")} subtitle={t("aIAgentPage.automatic247")} />
        <div className="p-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("aIAgentPage.loadingConfig")}
        </div>
      </AppLayout>
    );
  }


  // Slot start-time options for the extended-capacity picker, generated from the
  // widest working-hours window stepped by the appointment duration (so :30
  // slots appear when appointments are 30 min). Stored/compared as "HH:MM".
  const slotTimeOptions = (() => {
    const step = config.appointment_duration_min || 30;
    const wh = config.working_hours || {};
    let minStart = 24 * 60, maxEnd = 0;
    for (const k of Object.keys(wh)) {
      const d: any = (wh as any)[k];
      if (!d?.enabled) continue;
      const [sh, sm] = String(d.start || "09:00").split(":").map(Number);
      const [eh, em] = String(d.end || "18:00").split(":").map(Number);
      minStart = Math.min(minStart, sh * 60 + sm);
      maxEnd = Math.max(maxEnd, eh * 60 + em);
    }
    if (maxEnd <= minStart) { minStart = 7 * 60; maxEnd = 21 * 60; }
    const out: string[] = [];
    for (let t = minStart; t + step <= maxEnd; t += step) {
      out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
    }
    return out;
  })();
  const toggleTime = (ri: number, hm: string) => {
    const rules = config.appointment_slot_capacity.rules.map((r, i) =>
      i === ri ? { ...r, hours: r.hours.includes(hm) ? r.hours.filter(x => x !== hm) : [...r.hours, hm] } : r);
    set("appointment_slot_capacity", { ...config.appointment_slot_capacity, rules });
  };

  return (
    <AppLayout>
      <AppHeader title={t("aIAgentPage.aiAgent")} subtitle={t("aIAgentPage.automatic247Channels")} />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-3xl space-y-6">

          {/* Warning: no WhatsApp connected */}
          {hasWhatsApp === false && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <span className="text-lg leading-none mt-0.5">⚠️</span>
              <div>
                <p className="font-semibold mb-1">{t("aIAgentPage.noWhatsAppConnected")}</p>
                <p className="text-amber-700">{t("aIAgentPage.noWhatsAppDesc1")}<a href="../integraciones" className="underline font-medium">{t("aIAgentPage.integrationsWhatsAppLink")}</a>{t("aIAgentPage.noWhatsAppDesc2")}</p>
              </div>
            </div>
          )}

          {/* Status card */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${config.is_active ? "bg-green-100" : "bg-muted"}`}>
                    <Bot className={`h-5 w-5 ${config.is_active ? "text-green-600" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {config.is_active ? t("aIAgentPage.agentActive") : t("aIAgentPage.agentInactive")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {config.is_active
                        ? t("aIAgentPage.agentRespondingDesc")
                        : t("aIAgentPage.agentActivateDesc")}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config.is_active}
                  onCheckedChange={v => set("is_active", v)}
                />
              </div>

              <Separator className="my-4" />

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("aIAgentPage.creditsUsedThisMonth")}</span>
                <span className="font-semibold tabular-nums">
                  {conversationsThisMonth.toLocaleString()}
                  {subscription?.monthlyAiAgentCredits != null && (
                    <span className="text-muted-foreground font-normal">
                      {" "}/ {subscription.monthlyAiAgentCredits.toLocaleString()}
                    </span>
                  )}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Health check — surfaces why "agent on but silent" happens */}
          {(() => {
            const waEnabled = !!config.channels?.whatsapp;
            const igEnabled = !!config.channels?.instagram;
            const tokensOk = subscription?.monthlyAiAgentCredits == null || conversationsThisMonth < subscription.monthlyAiAgentCredits;
            const rows: { state: "ok" | "warn" | "bad"; label: string }[] = [];
            rows.push({ state: config.is_active ? "ok" : "bad", label: config.is_active ? t("aIAgentPage.healthAgentOn") : t("aIAgentPage.healthAgentOff") });
            rows.push({ state: tokensOk ? "ok" : "bad", label: tokensOk ? t("aIAgentPage.healthTokens") : t("aIAgentPage.healthNoTokens") });
            if (waEnabled) {
              rows.push({ state: hasWhatsApp ? "ok" : "bad", label: hasWhatsApp ? t("aIAgentPage.healthWaConnected") : t("aIAgentPage.healthWaNotConnected") });
              if (hasWhatsApp) {
                rows.push({ state: waReceiving ? "ok" : "warn", label: waReceiving ? t("aIAgentPage.healthWaReceiving") : t("aIAgentPage.healthWaNotReceiving") });
                rows.push({ state: waSendOk === false ? "bad" : "ok", label: waSendOk === false ? t("aIAgentPage.healthWaSendFail") : t("aIAgentPage.healthWaSend") });
              }
            }
            if (igEnabled) {
              rows.push({ state: hasInstagram ? "ok" : "bad", label: hasInstagram ? t("aIAgentPage.healthIgConnected") : t("aIAgentPage.healthIgNotConnected") });
            }
            const allGood = rows.every(r => r.state === "ok");
            return (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t("aIAgentPage.healthTitle")}</CardTitle>
                  <CardDescription>{allGood ? t("aIAgentPage.healthAllGood") : t("aIAgentPage.healthIssues")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {rows.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${r.state === "ok" ? "bg-green-500" : r.state === "warn" ? "bg-amber-500" : "bg-red-500"}`} />
                      <span className={r.state === "ok" ? "" : "text-muted-foreground"}>{r.label}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })()}

          {/* Channels */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("aIAgentPage.activeChannels")}</CardTitle>
              <CardDescription>{t("aIAgentPage.activeChannelsDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">WhatsApp</span>
                </div>
                <Switch
                  checked={config.channels.whatsapp}
                  onCheckedChange={v => set("channels", { ...config.channels, whatsapp: v })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Instagram className="h-4 w-4 text-pink-500" />
                  <span className="text-sm font-medium">Instagram DM</span>
                </div>
                <Switch
                  checked={config.channels.instagram}
                  onCheckedChange={v => set("channels", { ...config.channels, instagram: v })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <MessengerIcon size={16} />
                  <span className="text-sm font-medium">Messenger</span>
                </div>
                <Switch
                  checked={!!config.channels.messenger}
                  onCheckedChange={v => set("channels", { ...config.channels, messenger: v })}
                />
              </div>
              <div className="flex items-start justify-between rounded-lg border border-primary/30 bg-primary/5 p-3 gap-3">
                <div>
                  <p className="text-sm font-medium">{t("aIAgentPage.autoQualifyTitle")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("aIAgentPage.autoQualifyDesc")}</p>
                </div>
                <Switch
                  checked={config.auto_qualify}
                  onCheckedChange={v => set("auto_qualify", v)}
                  className="mt-0.5 shrink-0"
                />
              </div>
            </CardContent>
          </Card>

          {/* Identity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("aIAgentPage.agentIdentity")}</CardTitle>
              <CardDescription>{t("aIAgentPage.agentIdentityDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("aIAgentPage.agentName")}</Label>
                  <Input
                    placeholder={t("aIAgentPage.agentNamePlaceholder")}
                    value={config.agent_name}
                    onChange={e => set("agent_name", e.target.value)}
                    maxLength={40}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("aIAgentPage.businessName")}</Label>
                  <Input
                    placeholder={t("aIAgentPage.businessNamePlaceholder")}
                    value={config.business_name}
                    onChange={e => set("business_name", e.target.value)}
                    maxLength={80}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("aIAgentPage.responseTone")}</Label>
                <Select value={config.tone} onValueChange={v => set("tone", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amigable">{t("aIAgentPage.toneFriendly")}</SelectItem>
                    <SelectItem value="formal">{t("aIAgentPage.toneFormal")}</SelectItem>
                    <SelectItem value="casual">{t("aIAgentPage.toneCasual")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("aIAgentPage.regionLabel")}</Label>
                <Input
                  placeholder={t("aIAgentPage.regionPlaceholder")}
                  value={config.region}
                  onChange={e => set("region", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t("aIAgentPage.regionHelp")}</p>
              </div>
            </CardContent>
          </Card>

          {/* Knowledge base */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("aIAgentPage.knowledgeBase")}</CardTitle>
              <CardDescription>
                {t("aIAgentPage.knowledgeBaseDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("aIAgentPage.businessDescription")}</Label>
                <Textarea
                  placeholder={t("aIAgentPage.businessDescriptionPlaceholder")}
                  value={config.business_description}
                  onChange={e => set("business_description", e.target.value)}
                  rows={3}
                  maxLength={12000}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("aIAgentPage.productsServices")}</Label>
                <Textarea
                  placeholder={t("aIAgentPage.productsServicesPlaceholder")}
                  value={config.products}
                  onChange={e => set("products", e.target.value)}
                  rows={4}
                  maxLength={12000}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("aIAgentPage.faqs")}</Label>
                <Textarea
                  placeholder={t("aIAgentPage.faqsPlaceholder")}
                  value={config.faqs}
                  onChange={e => set("faqs", e.target.value)}
                  rows={5}
                  maxLength={12000}
                />
              </div>
            </CardContent>
          </Card>

          {/* Responses */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("aIAgentPage.autoResponses")}</CardTitle>
              <CardDescription>{t("aIAgentPage.autoResponsesDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  {t("aIAgentPage.whenEscalates")}
                </Label>
                <Textarea
                  value={config.escalation_response}
                  onChange={e => set("escalation_response", e.target.value)}
                  rows={2}
                  maxLength={300}
                />
                <p className="text-xs text-muted-foreground flex items-start gap-1">
                  <Info className="h-3 w-3 mt-0.5 shrink-0" />
                  {t("aIAgentPage.escalationHint")}
                </p>
              </div>
              <div className="space-y-2">
                <Label>{t("aIAgentPage.whenDoesntKnow")}</Label>
                <Textarea
                  value={config.off_topic_response}
                  onChange={e => set("off_topic_response", e.target.value)}
                  rows={2}
                  maxLength={300}
                />
              </div>
            </CardContent>
          </Card>

          {/* Appointments / Google Calendar */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-indigo-500" /> {t("aIAgentPage.appointmentScheduling")}
              </CardTitle>
              <CardDescription>
                {t("aIAgentPage.appointmentSchedulingDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{t("aIAgentPage.allowAgentSchedule")}</p>
                  <p className="text-xs text-muted-foreground">{t("aIAgentPage.allowAgentScheduleDesc")}</p>
                </div>
                <Switch checked={config.appointments_enabled} onCheckedChange={v => set("appointments_enabled", v)} />
              </div>

              {config.appointments_enabled && (
                <>
                  <div className="rounded-lg border p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{t("aIAgentPage.sendWhatsAppReminders")}</p>
                        <p className="text-xs text-muted-foreground">{t("aIAgentPage.sendWhatsAppRemindersDesc")}</p>
                      </div>
                      <Switch checked={config.reminders_enabled} onCheckedChange={v => set("reminders_enabled", v)} />
                    </div>
                    {config.reminders_enabled && (() => {
                      const approved = waTemplates.filter(x => (x.status || "").toUpperCase() === "APPROVED");
                      const sorted = [...config.reminders].sort((a, b) => b.minutes - a.minutes);
                      const updateAt = (minutes: number, patch: Partial<AgentConfig["reminders"][number]>) =>
                        set("reminders", config.reminders.map(r => r.minutes === minutes ? { ...r, ...patch } : r));
                      return (
                      <div className="space-y-3 pt-1">
                        <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2.5 text-[11px] text-amber-800 dark:text-amber-300">
                          ⚠️ Para enviar fuera de la ventana de 24h, WhatsApp exige una <b>plantilla aprobada</b> (tipo <b>Utility</b>) con <b>3 variables</b>: <code>{"{{1}}"}</code> nombre, <code>{"{{2}}"}</code> cita, <code>{"{{3}}"}</code> fecha/hora. Asigna una plantilla a cada recordatorio. Si dejas "Ninguna", ese recordatorio solo se enviará si el cliente escribió en las últimas 24h.
                        </div>

                        {/* One row per reminder: moment + its own template */}
                        <div className="space-y-2">
                          {sorted.map(r => (
                            <div key={r.minutes} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5">
                              <Badge variant="secondary" className="py-1 shrink-0">{offsetLabel(r.minutes)}</Badge>
                              <div className="flex-1 min-w-[200px]">
                                <Select
                                  value={r.template || "__none__"}
                                  onValueChange={v => {
                                    if (v === "__none__") { updateAt(r.minutes, { template: null }); return; }
                                    const t = approved.find(x => x.name === v);
                                    updateAt(r.minutes, { template: v, lang: t?.language || "es" });
                                  }}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("aIAgentPage.templatePlaceholder")} /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">{t("aIAgentPage.templateNone")}</SelectItem>
                                    {approved.map(tpl => (
                                      <SelectItem key={tpl.id} value={tpl.name}>{tpl.name} ({tpl.language})</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                                onClick={() => set("reminders", config.reminders.filter(x => x.minutes !== r.minutes))}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                          {config.reminders.length === 0 && <p className="text-xs text-muted-foreground">{t("aIAgentPage.noRemindersAddOne")}</p>}
                        </div>

                        {/* Add a new reminder moment */}
                        <div className="flex items-center gap-2">
                          <Select value={newOffset} onValueChange={setNewOffset}>
                            <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder={t("aIAgentPage.momentPlaceholder")} /></SelectTrigger>
                            <SelectContent>
                              {OFFSET_PRESETS.filter(o => !config.reminders.some(r => r.minutes === o.value)).map(o => (
                                <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="sm" variant="outline" className="h-8 text-xs"
                            onClick={() => {
                              const v = Number(newOffset);
                              if (v && !config.reminders.some(r => r.minutes === v)) set("reminders", [...config.reminders, { minutes: v, template: null, lang: "es" }]);
                            }}>
                            {t("aIAgentPage.addReminder")}
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">¿No aparece tu plantilla? Créala y sincronízala en <b>WA Plantillas</b>; debe estar <b>aprobada</b>.</p>
                      </div>
                      );
                    })()}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t("aIAgentPage.appointmentDuration")}</Label>
                      <Select value={String(config.appointment_duration_min)} onValueChange={v => set("appointment_duration_min", Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">{t("aIAgentPage.duration15min")}</SelectItem>
                          <SelectItem value="30">{t("aIAgentPage.duration30min")}</SelectItem>
                          <SelectItem value="45">{t("aIAgentPage.duration45min")}</SelectItem>
                          <SelectItem value="60">{t("aIAgentPage.duration1hour")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("aIAgentPage.appointmentModality")}</Label>
                      <Select value={config.appointment_modality} onValueChange={v => set("appointment_modality", v as AgentConfig["appointment_modality"])}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="both">{t("aIAgentPage.modalityBoth")}</SelectItem>
                          <SelectItem value="virtual">{t("aIAgentPage.modalityVirtual")}</SelectItem>
                          <SelectItem value="presencial">{t("aIAgentPage.modalityInPerson")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {config.appointment_modality !== "virtual" && (
                    <div className="space-y-2">
                      <Label>
                        {t("aIAgentPage.inPersonAddress")}
                        {config.appointment_modality === "presencial" && <span className="text-destructive"> *</span>}
                      </Label>
                      <Input
                        placeholder={t("aIAgentPage.inPersonAddressPlaceholder")}
                        value={config.meeting_address}
                        onChange={e => set("meeting_address", e.target.value)}
                        maxLength={200}
                      />
                      <p className="text-xs text-muted-foreground">
                        {config.appointment_modality === "presencial"
                          ? t("aIAgentPage.addressAllHere")
                          : t("aIAgentPage.addressIfInPerson")}
                      </p>
                    </div>
                  )}
                  {config.appointment_modality === "virtual" && (
                    <p className="text-xs text-muted-foreground -mt-1">
                      {t("aIAgentPage.allVirtualMeet")}
                    </p>
                  )}

                  <div className="space-y-2">
                    <Label>{t("aIAgentPage.businessHours")}</Label>
                    <p className="text-xs text-muted-foreground">{t("aIAgentPage.businessHoursDesc")}</p>
                    <div className="space-y-2 mt-2">
                      {DAY_LABELS.map(({ key, label }) => {
                        const d = config.working_hours[key];
                        return (
                          <div key={key} className="flex items-center gap-3 rounded-lg border p-2">
                            <Switch
                              checked={d.enabled}
                              onCheckedChange={v => set("working_hours", { ...config.working_hours, [key]: { ...d, enabled: v } })}
                            />
                            <span className="text-sm w-20">{label}</span>
                            {d.enabled ? (
                              <div className="flex items-center gap-2">
                                <Input type="time" value={d.start} className="h-8 w-28"
                                  onChange={e => set("working_hours", { ...config.working_hours, [key]: { ...d, start: e.target.value } })} />
                                <span className="text-muted-foreground text-sm">{t("aIAgentPage.timeTo")}</span>
                                <Input type="time" value={d.end} className="h-8 w-28"
                                  onChange={e => set("working_hours", { ...config.working_hours, [key]: { ...d, end: e.target.value } })} />
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">{t("aIAgentPage.closed")}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Concurrent capacity per slot */}
                  <div className="rounded-lg border p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{t("aIAgentPage.slotCapacityTitle")}</p>
                        <p className="text-xs text-muted-foreground">{t("aIAgentPage.slotCapacityDesc")}</p>
                      </div>
                      <Switch
                        checked={config.appointment_slot_capacity.enabled}
                        onCheckedChange={v => set("appointment_slot_capacity", { ...config.appointment_slot_capacity, enabled: v })}
                      />
                    </div>
                    {config.appointment_slot_capacity.enabled && (
                      <div className="space-y-3 pt-1">
                        {config.appointment_slot_capacity.rules.map((rule, ri) => {
                          const setRule = (patch: Partial<typeof rule>) => {
                            const rules = config.appointment_slot_capacity.rules.map((r, i) => i === ri ? { ...r, ...patch } : r);
                            set("appointment_slot_capacity", { ...config.appointment_slot_capacity, rules });
                          };
                          const toggleDay = (n: number) => {
                            setRule({ days: rule.days.includes(n) ? rule.days.filter(x => x !== n) : [...rule.days, n] });
                          };
                          return (
                            <div key={ri} className="rounded-lg border bg-muted/20 p-3 space-y-3 relative">
                              {config.appointment_slot_capacity.rules.length > 1 && (
                                <button type="button"
                                  onClick={() => set("appointment_slot_capacity", { ...config.appointment_slot_capacity, rules: config.appointment_slot_capacity.rules.filter((_, i) => i !== ri) })}
                                  className="absolute top-2 right-2 text-muted-foreground hover:text-destructive">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <div className="flex items-center gap-2">
                                <Label className="text-xs">{t("aIAgentPage.slotCapacityHowMany")}</Label>
                                <Select value={String(rule.capacity)} onValueChange={v => setRule({ capacity: Number(v) })}>
                                  <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                                  <SelectContent>{[2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                                </Select>
                                <span className="text-xs text-muted-foreground">{t("aIAgentPage.slotCapacityPeople")}</span>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">{t("aIAgentPage.slotCapacityDays")}</Label>
                                <div className="flex flex-wrap gap-1.5">
                                  {[{n:1,l:"Lun"},{n:2,l:"Mar"},{n:3,l:"Mié"},{n:4,l:"Jue"},{n:5,l:"Vie"},{n:6,l:"Sáb"},{n:0,l:"Dom"}].map(({n,l}) => {
                                    const on = rule.days.includes(n);
                                    return (
                                      <button key={n} type="button" onClick={() => toggleDay(n)}
                                        className={`px-2.5 py-1 rounded-md text-xs border ${on ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-muted-foreground"}`}>{l}</button>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">{t("aIAgentPage.slotCapacityHours")}</Label>
                                <div className="flex flex-wrap gap-1.5">
                                  {slotTimeOptions.map(hm => {
                                    const on = rule.hours.includes(hm);
                                    return (
                                      <button key={hm} type="button" onClick={() => toggleTime(ri, hm)}
                                        className={`px-2 py-1 rounded-md text-xs border ${on ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-muted-foreground"}`}>{hm}</button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <button type="button"
                          onClick={() => set("appointment_slot_capacity", { ...config.appointment_slot_capacity, rules: [...config.appointment_slot_capacity.rules, { days: [6,0], hours: [10,11], capacity: 2 }] })}
                          className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                          <Plus className="h-3.5 w-3.5" /> {t("aIAgentPage.slotCapacityAddRule")}
                        </button>
                        <p className="text-[11px] text-muted-foreground">{t("aIAgentPage.slotCapacityHint")}</p>
                      </div>
                    )}
                  </div>

                  {/* Paid appointments */}
                  <div className="rounded-lg border p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{t("aIAgentPage.appointmentsRequirePayment")}</p>
                        <p className="text-xs text-muted-foreground">{t("aIAgentPage.appointmentsRequirePaymentDesc")}</p>
                      </div>
                      <Switch checked={config.appointments_paid} onCheckedChange={v => set("appointments_paid", v)} />
                    </div>
                    {config.appointments_paid && (
                      <div className="space-y-3 pt-1">
                        <div className="space-y-1.5">
                          <Label className="text-xs">{t("aIAgentPage.paymentLinks")}</Label>
                          <Textarea
                            placeholder={t("aIAgentPage.paymentLinksPlaceholder")}
                            value={config.payment_link}
                            onChange={e => set("payment_link", e.target.value)}
                            rows={4}
                            maxLength={1500}
                          />
                          <p className="text-[11px] text-muted-foreground">{t("aIAgentPage.paymentLinksHint")}</p>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">{t("aIAgentPage.pricesServices")}</Label>
                          <Textarea
                            placeholder={t("aIAgentPage.pricesServicesPlaceholder")}
                            value={config.payment_info}
                            onChange={e => set("payment_info", e.target.value)}
                            rows={3}
                            maxLength={1000}
                          />
                          <p className="text-[11px] text-muted-foreground">{t("aIAgentPage.pricesServicesHint")}</p>
                        </div>

                        <div className="flex items-center justify-between rounded-md border p-2.5">
                          <div>
                            <p className="text-sm font-medium">{t("aIAgentPage.requestPaymentProof")}</p>
                            <p className="text-xs text-muted-foreground">{t("aIAgentPage.requestPaymentProofDesc")}</p>
                          </div>
                          <Switch checked={config.require_payment_proof} onCheckedChange={v => set("require_payment_proof", v)} />
                        </div>

                        {config.require_payment_proof && (
                          <div className="space-y-1.5">
                            <Label className="text-xs">{t("aIAgentPage.paymentAccountInfo")}</Label>
                            <Input
                              placeholder={t("aIAgentPage.paymentAccountInfoPlaceholder")}
                              value={config.payment_account_info}
                              onChange={e => set("payment_account_info", e.target.value)}
                              maxLength={200}
                            />
                            <p className="text-[11px] text-muted-foreground">{t("aIAgentPage.paymentAccountInfoHint")}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Media library */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-pink-500" /> {t("aIAgentPage.fileLibrary")}
              </CardTitle>
              <CardDescription>
                {t("aIAgentPage.fileLibraryDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Upload form */}
              <div className="rounded-lg border border-dashed p-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("aIAgentPage.fileName")}</Label>
                    <Input placeholder={t("aIAgentPage.fileNamePlaceholder")} value={newMediaName} onChange={e => setNewMediaName(e.target.value)} maxLength={80} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("aIAgentPage.whenToSend")}</Label>
                    <Input placeholder={t("aIAgentPage.whenToSendPlaceholder")} value={newMediaDesc} onChange={e => setNewMediaDesc(e.target.value)} maxLength={200} />
                  </div>
                </div>
                <div>
                  <input
                    id="agent-media-file" type="file" className="hidden"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadMedia(f); e.target.value = ""; }}
                  />
                  <Button variant="outline" size="sm" disabled={uploading}
                    onClick={() => document.getElementById("agent-media-file")?.click()}>
                    {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    {t("aIAgentPage.uploadFileButton")}
                  </Button>
                </div>
              </div>

              {/* Existing media */}
              {media.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">{t("aIAgentPage.noFilesYet")}</p>
              ) : (
                <div className="space-y-2">
                  {media.map(m => (
                    <div key={m.id} className="flex items-center gap-3 rounded-lg border p-3">
                      {m.file_type === "image"
                        ? <img src={m.file_url} alt={m.name} className="h-10 w-10 rounded object-cover shrink-0" />
                        : <div className="h-10 w-10 rounded bg-red-50 flex items-center justify-center shrink-0"><FileText className="h-5 w-5 text-red-500" /></div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{m.name}</p>
                        {m.description && <p className="text-xs text-muted-foreground truncate">{m.description}</p>}
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteMedia(m.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Save — hidden for read-only members */}
          {canEditAgent && (
            <div className="flex justify-end pb-6">
              <Button onClick={handleSave} disabled={saving} size="lg">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {t("aIAgentPage.saveConfig")}
              </Button>
            </div>
          )}
          {!canEditAgent && (
            <div className="flex items-center justify-center gap-2 pb-6 text-xs text-muted-foreground">
              <Eye className="h-3.5 w-3.5" /> {t("aIAgentPage.readOnlyMode")}
            </div>
          )}

        </div>
      </div>
    </AppLayout>
  );
}
