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
import { Bot, Loader2, Save, MessageCircle, Instagram, Zap, Info, CalendarClock, Upload, Trash2, Image as ImageIcon, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { useSubscription } from "@/hooks/useSubscription";

type DayHours = { enabled: boolean; start: string; end: string };
type WorkingHours = Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", DayHours>;

interface AgentConfig {
  id?: string;
  is_active: boolean;
  agent_name: string;
  business_name: string;
  business_description: string;
  products: string;
  faqs: string;
  tone: string;
  escalation_response: string;
  off_topic_response: string;
  channels: { whatsapp: boolean; instagram: boolean };
  appointments_enabled: boolean;
  appointment_duration_min: number;
  working_hours: WorkingHours;
  meeting_address: string;
  appointment_modality: "both" | "virtual" | "presencial";
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
  agent_name: "Asistente",
  business_name: "",
  business_description: "",
  products: "",
  faqs: "",
  tone: "amigable",
  escalation_response: "¡Claro! Un momento, voy a comunicarte con uno de nuestros asesores para que te ayuden mejor. 😊",
  off_topic_response: "Lo siento, no tengo información sobre ese tema. Un asesor te ayudará en breve.",
  channels: { whatsapp: true, instagram: false },
  appointments_enabled: false,
  appointment_duration_min: 30,
  working_hours: DEFAULT_HOURS,
  meeting_address: "",
  appointment_modality: "both",
};

export default function AIAgentPage() {
  const { organizationId } = useOrganizationContext();
  const { subscription } = useSubscription();
  const [config, setConfig] = useState<AgentConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [conversationsThisMonth, setConversationsThisMonth] = useState(0);
  const [hasWhatsApp, setHasWhatsApp] = useState<boolean | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [newMediaName, setNewMediaName] = useState("");
  const [newMediaDesc, setNewMediaDesc] = useState("");

  useEffect(() => {
    if (!organizationId) { setLoading(false); return; }
    loadConfig();
    loadUsage();
    loadMedia();
    // Check if org has an active WhatsApp number
    supabase
      .from("whatsapp_configs")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setHasWhatsApp(!!data));
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
          agent_name: data.agent_name ?? "Asistente",
          business_name: data.business_name ?? "",
          business_description: data.business_description ?? "",
          products: data.products ?? "",
          faqs: data.faqs ?? "",
          tone: data.tone ?? "amigable",
          escalation_response: data.escalation_response ?? DEFAULT_CONFIG.escalation_response,
          off_topic_response: data.off_topic_response ?? DEFAULT_CONFIG.off_topic_response,
          channels: data.channels ?? { whatsapp: true, instagram: false },
          appointments_enabled: data.appointments_enabled ?? false,
          appointment_duration_min: data.appointment_duration_min ?? 30,
          working_hours: (data.working_hours as WorkingHours) ?? DEFAULT_HOURS,
          meeting_address: data.meeting_address ?? "",
          appointment_modality: (data.appointment_modality as AgentConfig["appointment_modality"]) ?? "both",
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
        .select("ai_agent_conversations_used")
        .eq("organization_id", organizationId)
        .eq("period_start", monthStart)
        .maybeSingle();
      setConversationsThisMonth(data?.ai_agent_conversations_used ?? 0);
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

  async function handleUploadMedia(file: File) {
    if (!organizationId) return;
    if (!newMediaName.trim()) { toast.error("Ponle un nombre al archivo primero"); return; }
    if (file.size > 16 * 1024 * 1024) { toast.error("El archivo supera 16 MB (límite de WhatsApp)"); return; }
    setUploading(true);
    try {
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
      toast.success("Archivo agregado a la biblioteca");
      setNewMediaName(""); setNewMediaDesc("");
      loadMedia();
    } catch (err: any) {
      toast.error("Error al subir: " + (err?.message || "intenta de nuevo"));
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteMedia(id: string) {
    const { error } = await supabase.from("agent_media").update({ is_active: false }).eq("id", id);
    if (error) { toast.error("No se pudo eliminar"); return; }
    setMedia(prev => prev.filter(m => m.id !== id));
  }

  async function handleSave() {
    if (!organizationId) return;
    setSaving(true);
    try {
      const payload = {
        organization_id: organizationId,
        is_active: config.is_active,
        agent_name: config.agent_name.trim() || "Asistente",
        business_name: config.business_name.trim() || null,
        business_description: config.business_description.trim() || null,
        products: config.products.trim() || null,
        faqs: config.faqs.trim() || null,
        tone: config.tone,
        escalation_response: config.escalation_response.trim(),
        off_topic_response: config.off_topic_response.trim(),
        channels: config.channels,
        appointments_enabled: config.appointments_enabled,
        appointment_duration_min: config.appointment_duration_min,
        working_hours: config.working_hours,
        meeting_address: config.meeting_address.trim() || null,
        appointment_modality: config.appointment_modality,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("ai_agent_configs")
        .upsert(payload, { onConflict: "organization_id" });

      if (error) throw error;
      toast.success("Configuración del agente guardada");
    } catch (err: any) {
      console.warn("Error saving agent config:", err);
      toast.error("Error al guardar la configuración");
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
        <AppHeader title="Agente IA" subtitle="Atención 24/7 automática" />
        <div className="p-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando configuración...
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AppHeader title="Agente IA" subtitle="Atención 24/7 automática en WhatsApp e Instagram" />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-3xl space-y-6">

          {/* Warning: no WhatsApp connected */}
          {hasWhatsApp === false && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <span className="text-lg leading-none mt-0.5">⚠️</span>
              <div>
                <p className="font-semibold mb-1">No tienes WhatsApp conectado</p>
                <p className="text-amber-700">El agente no puede responder sin un número de WhatsApp activo. Ve a <a href="../integraciones" className="underline font-medium">Integraciones → WhatsApp Business</a> para conectar tu número primero.</p>
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
                      {config.is_active ? "Agente activo" : "Agente inactivo"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {config.is_active
                        ? "Respondiendo conversaciones automáticamente"
                        : "Actívalo para que empiece a atender"}
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
                <span className="text-muted-foreground">Conversaciones este mes</span>
                <span className="font-semibold tabular-nums">
                  {conversationsThisMonth.toLocaleString()}
                  {subscription?.monthlyAiAgentConversations != null && (
                    <span className="text-muted-foreground font-normal">
                      {" "}/ {subscription.monthlyAiAgentConversations.toLocaleString()}
                    </span>
                  )}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Channels */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Canales activos</CardTitle>
              <CardDescription>El agente solo responde en los canales que actives.</CardDescription>
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
            </CardContent>
          </Card>

          {/* Identity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Identidad del agente</CardTitle>
              <CardDescription>Cómo se presenta el agente y cuál es el tono de respuesta.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nombre del agente</Label>
                  <Input
                    placeholder="Asistente"
                    value={config.agent_name}
                    onChange={e => set("agent_name", e.target.value)}
                    maxLength={40}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nombre de tu negocio</Label>
                  <Input
                    placeholder="Ej: Tienda Moderna"
                    value={config.business_name}
                    onChange={e => set("business_name", e.target.value)}
                    maxLength={80}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tono de respuesta</Label>
                <Select value={config.tone} onValueChange={v => set("tone", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amigable">Amigable y cercano</SelectItem>
                    <SelectItem value="formal">Formal y profesional</SelectItem>
                    <SelectItem value="casual">Casual y relajado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Knowledge base */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Base de conocimiento</CardTitle>
              <CardDescription>
                Cuéntale al agente sobre tu negocio. Mientras más detallado, mejores respuestas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Descripción del negocio</Label>
                <Textarea
                  placeholder="Ej: Somos una tienda de ropa para mujer ubicada en Bogotá. Vendemos ropa casual y de oficina. Hacemos envíos a todo Colombia."
                  value={config.business_description}
                  onChange={e => set("business_description", e.target.value)}
                  rows={3}
                  maxLength={1000}
                />
              </div>
              <div className="space-y-2">
                <Label>Productos y servicios</Label>
                <Textarea
                  placeholder={"Ej:\n- Vestidos casuales: $80.000 - $150.000\n- Blusas: $45.000 - $90.000\n- Jeans: $120.000 - $200.000\nEnvío gratis en compras mayores a $200.000"}
                  value={config.products}
                  onChange={e => set("products", e.target.value)}
                  rows={4}
                  maxLength={2000}
                />
              </div>
              <div className="space-y-2">
                <Label>Preguntas frecuentes</Label>
                <Textarea
                  placeholder={"Ej:\nP: ¿Cuánto demora el envío?\nR: 2-3 días hábiles a todo Colombia.\n\nP: ¿Hacen cambios?\nR: Sí, tienes 30 días para cambiar tu producto."}
                  value={config.faqs}
                  onChange={e => set("faqs", e.target.value)}
                  rows={5}
                  maxLength={3000}
                />
              </div>
            </CardContent>
          </Card>

          {/* Responses */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Respuestas automáticas</CardTitle>
              <CardDescription>Texto que usa el agente en situaciones específicas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  Cuando escala al humano
                </Label>
                <Textarea
                  value={config.escalation_response}
                  onChange={e => set("escalation_response", e.target.value)}
                  rows={2}
                  maxLength={300}
                />
                <p className="text-xs text-muted-foreground flex items-start gap-1">
                  <Info className="h-3 w-3 mt-0.5 shrink-0" />
                  Se envía cuando el lead quiere hablar con una persona o muestra intención de compra.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Cuando no sabe la respuesta</Label>
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
                <CalendarClock className="h-4 w-4 text-indigo-500" /> Agendamiento de citas
              </CardTitle>
              <CardDescription>
                Deja que el agente agende citas en Google Calendar cuando el cliente lo pida. La cita se crea en el CRM y en el calendario del vendedor asignado (o el dueño).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Permitir que el agente agende citas</p>
                  <p className="text-xs text-muted-foreground">Requiere que el vendedor/dueño haya conectado Google Calendar en Integraciones.</p>
                </div>
                <Switch checked={config.appointments_enabled} onCheckedChange={v => set("appointments_enabled", v)} />
              </div>

              {config.appointments_enabled && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Duración de cada cita</Label>
                      <Select value={String(config.appointment_duration_min)} onValueChange={v => set("appointment_duration_min", Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">15 minutos</SelectItem>
                          <SelectItem value="30">30 minutos</SelectItem>
                          <SelectItem value="45">45 minutos</SelectItem>
                          <SelectItem value="60">1 hora</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Modalidad de las citas</Label>
                      <Select value={config.appointment_modality} onValueChange={v => set("appointment_modality", v as AgentConfig["appointment_modality"])}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="both">Ambas (el agente pregunta)</SelectItem>
                          <SelectItem value="virtual">Solo virtuales (Meet)</SelectItem>
                          <SelectItem value="presencial">Solo presenciales</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {config.appointment_modality !== "virtual" && (
                    <div className="space-y-2">
                      <Label>
                        Dirección para citas presenciales
                        {config.appointment_modality === "presencial" && <span className="text-destructive"> *</span>}
                      </Label>
                      <Input
                        placeholder="Ej: Calle 10 #43-20, Oficina 501, Medellín"
                        value={config.meeting_address}
                        onChange={e => set("meeting_address", e.target.value)}
                        maxLength={200}
                      />
                      <p className="text-xs text-muted-foreground">
                        {config.appointment_modality === "presencial"
                          ? "Todas las citas se agendarán en esta dirección."
                          : "Si el cliente elige presencial, el agente usará esta dirección automáticamente."}
                      </p>
                    </div>
                  )}
                  {config.appointment_modality === "virtual" && (
                    <p className="text-xs text-muted-foreground -mt-1">
                      🎥 Todas las citas serán virtuales — el agente generará un enlace de Google Meet automáticamente.
                    </p>
                  )}

                  <div className="space-y-2">
                    <Label>Horario de atención</Label>
                    <p className="text-xs text-muted-foreground">El agente solo ofrecerá y agendará dentro de estas horas.</p>
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
                                <span className="text-muted-foreground text-sm">a</span>
                                <Input type="time" value={d.end} className="h-8 w-28"
                                  onChange={e => set("working_hours", { ...config.working_hours, [key]: { ...d, end: e.target.value } })} />
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Cerrado</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Media library */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-pink-500" /> Biblioteca de archivos
              </CardTitle>
              <CardDescription>
                Sube imágenes o PDF (catálogo, lista de precios, fotos). El agente los enviará automáticamente cuando ayuden a la conversación, según la descripción.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Upload form */}
              <div className="rounded-lg border border-dashed p-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nombre del archivo</Label>
                    <Input placeholder="Ej: Catálogo 2026" value={newMediaName} onChange={e => setNewMediaName(e.target.value)} maxLength={80} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">¿Cuándo enviarlo?</Label>
                    <Input placeholder="Ej: cuando pidan el catálogo o precios" value={newMediaDesc} onChange={e => setNewMediaDesc(e.target.value)} maxLength={200} />
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
                    Subir archivo (imagen o PDF, máx 16 MB)
                  </Button>
                </div>
              </div>

              {/* Existing media */}
              {media.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Aún no has subido archivos.</p>
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

          {/* Save */}
          <div className="flex justify-end pb-6">
            <Button onClick={handleSave} disabled={saving} size="lg">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar configuración
            </Button>
          </div>

        </div>
      </div>
    </AppLayout>
  );
}
