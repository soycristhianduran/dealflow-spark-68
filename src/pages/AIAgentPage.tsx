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
import { Bot, Loader2, Save, MessageCircle, Instagram, Zap, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { useSubscription } from "@/hooks/useSubscription";

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
};

export default function AIAgentPage() {
  const { organizationId } = useOrganizationContext();
  const { subscription } = useSubscription();
  const [config, setConfig] = useState<AgentConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [conversationsThisMonth, setConversationsThisMonth] = useState(0);
  const [hasWhatsApp, setHasWhatsApp] = useState<boolean | null>(null);

  useEffect(() => {
    if (!organizationId) { setLoading(false); return; }
    loadConfig();
    loadUsage();
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
