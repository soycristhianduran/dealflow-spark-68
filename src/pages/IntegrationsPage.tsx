import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CheckCircle2, Circle, ExternalLink, Shield, Zap, ArrowRight, Loader2, AlertTriangle, Star, Trash2, Plus, Pencil, Check, X, Webhook, Copy, Eye, EyeOff } from "lucide-react";
import { WhatsAppIcon, InstagramIcon, FacebookIcon, TikTokIcon, GoogleCalendarIcon } from "@/components/icons/BrandIcons";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { useFacebookIntegration } from "@/hooks/useFacebookIntegration";
import { useWhatsAppIntegration } from "@/hooks/useWhatsAppIntegration";
import { useInstagramIntegration } from "@/hooks/useInstagramIntegration";
import { FacebookSetupWizard } from "@/components/crm/FacebookSetupWizard";
import { WhatsAppSetupWizard } from "@/components/crm/WhatsAppSetupWizard";
import { InstagramSetupWizard } from "@/components/crm/InstagramSetupWizard";
import { useOrganizationContext } from "@/context/OrganizationContext";

type Integration = {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  features: string[];
  setupSteps: string[];
  requirements: string[];
  docsUrl: string;
};

const integrations: Integration[] = [
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Sincroniza tus citas y reuniones automáticamente con Google Calendar.",
    icon: GoogleCalendarIcon,
    color: "hsl(217, 91%, 60%)",
    features: [
      "Creación automática de eventos al agendar reuniones",
      "Sincronización directa con tu calendario principal",
      "Notificaciones y recordatorios de Google",
    ],
    setupSteps: [
      "Haz clic en 'Conectar' para iniciar sesión con tu cuenta de Google",
      "Autoriza el acceso a Google Calendar",
      "¡Listo! Tus citas se crearán automáticamente en Google Calendar",
    ],
    requirements: ["Cuenta de Google activa"],
    docsUrl: "https://calendar.google.com",
  },
  {
    id: "facebook",
    name: "Facebook Ads",
    description: "Conecta tus páginas, formularios de leads, Messenger y campañas de Meta Ads.",
    icon: FacebookIcon,
    color: "hsl(221, 44%, 41%)",
    features: [
      "Selecciona tus páginas de Facebook",
      "Sincroniza formularios nativos de Lead Ads",
      "Captura mensajes de Messenger automáticamente",
      "Importa historial completo de campañas de Meta Ads",
    ],
    setupSteps: [
      "Haz clic en 'Conectar' para autorizar con tu cuenta de Facebook",
      "Selecciona las páginas que quieres conectar",
      "Elige los formularios de leads a sincronizar",
      "Importa tus campañas de Meta Ads",
    ],
    requirements: ["Cuenta de Facebook Business", "Página de Facebook activa"],
    docsUrl: "https://business.facebook.com",
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    description: "Envía y recibe mensajes de WhatsApp directamente desde tu CRM.",
    icon: WhatsAppIcon,
    color: "hsl(142, 70%, 45%)",
    features: [
      "Envío de mensajes desde el CRM",
      "Recepción de mensajes entrantes",
      "Plantillas de mensajes aprobadas",
      "Historial de conversaciones por lead",
    ],
    setupSteps: [
      "Crea una cuenta en Meta Business Suite",
      "Configura WhatsApp Business API",
      "Obtén tu Token de acceso y Phone Number ID",
      "Ingresa las credenciales en el formulario de conexión",
    ],
    requirements: ["Cuenta de Meta Business", "WhatsApp Business API aprobada", "Número de teléfono verificado"],
    docsUrl: "https://business.whatsapp.com",
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Recibe mensajes de Instagram Direct y gestiona leads desde la plataforma.",
    icon: InstagramIcon,
    color: "hsl(340, 75%, 55%)",
    features: [
      "Recepción de mensajes de Instagram Direct",
      "Respuestas automáticas a comentarios",
      "Captura de leads desde formularios",
      "Seguimiento de interacciones por lead",
    ],
    setupSteps: [
      "Conecta tu cuenta de Instagram Business via Meta",
      "Vincula tu página de Facebook asociada",
      "Autoriza permisos de mensajería",
      "Configura respuestas automáticas si lo deseas",
    ],
    requirements: ["Cuenta de Instagram Business/Creator", "Página de Facebook vinculada", "Acceso a Meta Business Suite"],
    docsUrl: "https://business.instagram.com",
  },
  {
    id: "tiktok",
    name: "TikTok Ads",
    description: "Integra TikTok Ads para capturar leads de tus campañas de video.",
    icon: TikTokIcon,
    color: "hsl(0, 0%, 10%)",
    features: [
      "Captura de leads desde TikTok Lead Gen",
      "Sincronización de formularios de TikTok",
      "Tracking de conversiones",
      "Audiencias personalizadas desde el CRM",
    ],
    setupSteps: [
      "Crea una cuenta en TikTok for Business",
      "Accede al TikTok Ads Manager",
      "Genera un token de acceso en la sección de desarrolladores",
      "Ingresa las credenciales en el formulario de conexión",
    ],
    requirements: ["Cuenta de TikTok for Business", "TikTok Ads Manager activo", "Acceso a TikTok Marketing API"],
    docsUrl: "https://ads.tiktok.com",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Webhooks section
// ─────────────────────────────────────────────────────────────────────────────

const WEBHOOK_EVENTS = [
  { value: "contact.created",  label: "Contacto creado",      description: "Cuando se crea un nuevo contacto" },
  { value: "contact.updated",  label: "Contacto actualizado", description: "Cuando cambia estado, dueño, email o teléfono" },
  { value: "form.submitted",   label: "Formulario enviado",   description: "Cuando alguien envía un formulario de landing page" },
];

type WebhookSub = {
  id: string;
  url: string;
  events: string[];
  secret: string;
  is_active: boolean;
  last_triggered_at: string | null;
  failure_count: number;
};

function WebhooksSection() {
  const { organizationId } = useOrganizationContext();
  const [subs, setSubs] = useState<WebhookSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>(["contact.created"]);
  const [revealSecrets, setRevealSecrets] = useState<Record<string, boolean>>({});
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from("webhook_subscriptions")
        .select("id, url, events, secret, is_active, last_triggered_at, failure_count")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      setSubs(data || []);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newUrl.trim() || !newEvents.length || !organizationId) return;
    try { new URL(newUrl.trim()); } catch {
      toast.error("URL inválida"); return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("webhook_subscriptions")
      .insert({ organization_id: organizationId, url: newUrl.trim(), events: newEvents })
      .select("secret")
      .single();
    setSaving(false);
    if (error) { toast.error(`Error al crear webhook: ${error.message}`); console.error("webhook insert error", error); return; }
    setNewSecret(data.secret);
    setNewUrl("");
    setNewEvents(["contact.created"]);
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("webhook_subscriptions").delete().eq("id", id);
    setSubs(prev => prev.filter(s => s.id !== id));
    toast.success("Webhook eliminado");
  };

  const handleToggle = async (id: string, active: boolean) => {
    await supabase.from("webhook_subscriptions").update({ is_active: active, failure_count: 0 }).eq("id", id);
    setSubs(prev => prev.map(s => s.id === id ? { ...s, is_active: active, failure_count: 0 } : s));
  };

  const copyToClipboard = (text: string, label = "Copiado") => {
    navigator.clipboard.writeText(text).then(() => toast.success(label));
  };

  const shortUrl = (url: string) => {
    try {
      const u = new URL(url);
      return u.hostname + (u.pathname.length > 30 ? u.pathname.slice(0, 30) + "…" : u.pathname);
    } catch { return url.slice(0, 50); }
  };

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Webhook className="h-4 w-4 text-muted-foreground" />
            Webhooks
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Notifica a n8n, Zapier o Make cuando ocurra un evento en el CRM
          </p>
        </div>
        <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => { setNewSecret(null); setDialogOpen(true); }}>
          <Plus className="h-3.5 w-3.5" /> Nuevo webhook
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : subs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Webhook className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Aún no tienes webhooks configurados</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Crea uno para conectar con n8n, Zapier o Make
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {subs.map(sub => (
            <div key={sub.id} className="rounded-lg border bg-card px-4 py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-mono font-medium truncate max-w-xs" title={sub.url}>
                    {shortUrl(sub.url)}
                  </span>
                  {sub.failure_count > 0 && (
                    <Badge variant="destructive" className="text-[10px] h-4 px-1.5">
                      {sub.failure_count} {sub.failure_count === 1 ? "falla" : "fallas"}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {sub.events.map(e => {
                    const ev = WEBHOOK_EVENTS.find(x => x.value === e);
                    return (
                      <Badge key={e} variant="secondary" className="text-[10px] h-4 px-1.5">
                        {ev?.label || e}
                      </Badge>
                    );
                  })}
                </div>
                {sub.last_triggered_at && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Último envío: {new Date(sub.last_triggered_at).toLocaleString("es-CO")}
                  </p>
                )}
                {/* Secret row */}
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="text-[10px] text-muted-foreground">Secret:</span>
                  <code className="text-[10px] font-mono text-muted-foreground">
                    {revealSecrets[sub.id] ? sub.secret : "••••••••••••••••"}
                  </code>
                  <button
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setRevealSecrets(prev => ({ ...prev, [sub.id]: !prev[sub.id] }))}
                  >
                    {revealSecrets[sub.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                  <button
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => copyToClipboard(sub.secret, "Secret copiado")}
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 mt-0.5">
                <Switch
                  checked={sub.is_active}
                  onCheckedChange={(v) => handleToggle(sub.id, v)}
                  className="scale-75"
                />
                <button
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  onClick={() => handleDelete(sub.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add webhook dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setNewSecret(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="h-4 w-4" /> Nuevo webhook
            </DialogTitle>
          </DialogHeader>

          {newSecret ? (
            /* Step 2: show secret after creation */
            <div className="space-y-4">
              <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3">
                <p className="text-sm font-medium text-green-800 dark:text-green-300 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> Webhook creado
                </p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                  Guarda este secret — no lo podrás ver completo de nuevo. Úsalo para verificar
                  la firma <code className="font-mono">X-Webhook-Signature</code> de cada entrega.
                </p>
              </div>
              <div>
                <Label className="text-xs">Secret (HMAC-SHA256)</Label>
                <div className="flex items-center gap-1.5 mt-1">
                  <code className="flex-1 text-xs font-mono bg-muted rounded px-2 py-1.5 break-all">
                    {newSecret}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
                    onClick={() => copyToClipboard(newSecret, "Secret copiado")}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Cómo verificar en n8n / Zapier / Make</p>
                <p>Cada POST incluye el header:</p>
                <code className="block font-mono">X-Webhook-Signature: sha256=…</code>
                <p>Compútalo con <strong>HMAC-SHA256</strong> sobre el body completo usando este secret.</p>
              </div>
              <Button className="w-full" onClick={() => setDialogOpen(false)}>Listo</Button>
            </div>
          ) : (
            /* Step 1: form */
            <div className="space-y-4">
              <div>
                <Label className="text-xs" htmlFor="wh-url">URL del endpoint</Label>
                <Input
                  id="wh-url"
                  className="mt-1 text-sm font-mono"
                  placeholder="https://hooks.zapier.com/hooks/catch/…"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Eventos a escuchar</Label>
                <div className="mt-2 space-y-2">
                  {WEBHOOK_EVENTS.map(ev => (
                    <label key={ev.value} className="flex items-start gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        className="mt-0.5 rounded"
                        checked={newEvents.includes(ev.value)}
                        onChange={(e) => {
                          setNewEvents(prev =>
                            e.target.checked
                              ? [...prev, ev.value]
                              : prev.filter(x => x !== ev.value)
                          );
                        }}
                      />
                      <div>
                        <p className="text-sm font-medium leading-none">{ev.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{ev.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Payload de ejemplo</p>
                <pre className="font-mono leading-relaxed overflow-x-auto">{`{
  "event": "contact.created",
  "timestamp": 1748482800,
  "organization_id": "...",
  "data": { "id": "...", "first_name": "Ana", ... }
}`}</pre>
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleAdd}
                  disabled={saving || !newUrl.trim() || newEvents.length === 0}
                >
                  {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Creando…</> : "Crear webhook"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function IntegrationsPage() {
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [fbWizardOpen, setFbWizardOpen] = useState(false);
  const [waWizardOpen, setWaWizardOpen] = useState(false);
  const [igWizardOpen, setIgWizardOpen] = useState(false);
  const [waWizardStartStep, setWaWizardStartStep] = useState<1 | 2>(1);
  const [wrongAppWarning, setWrongAppWarning] = useState<{ app_name: string } | null>(null);
  // Label editing state per config id
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState("");
  const gcal = useGoogleCalendar();
  const fb = useFacebookIntegration();
  const wa = useWhatsAppIntegration();
  const ig = useInstagramIntegration();

  // Check whether the stored WhatsApp token belongs to THIS CRM's Meta app.
  // If not, incoming messages won't arrive (WABA is subscribed to the wrong app).
  useEffect(() => {
    if (!wa.isConnected) { setWrongAppWarning(null); return; }
    supabase.functions.invoke("whatsapp-api", { body: { action: "check_webhook_app" } })
      .then(({ data, error }) => {
        if (error || data?.error) return; // non-fatal: don't show warning on network errors
        if (data && !data.is_crm_app) {
          setWrongAppWarning({ app_name: data.app_name || "otra aplicación" });
        } else {
          setWrongAppWarning(null);
        }
      })
      .catch(() => {}); // non-fatal
  }, [wa.isConnected]);

  // Detect OAuth callback URL params here (NOT in the hook) so that only one
  // component instance processes them — the wizard's hook instance was consuming
  // them first, leaving IntegrationsPage unable to open the wizard at step 2.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const clearParam = (key: string) => {
      const url = new URL(window.location.href);
      url.searchParams.delete(key);
      window.history.replaceState({}, "", url.toString());
    };

    if (params.get("wa_connected") === "true") {
      toast.success("¡WhatsApp conectado exitosamente!");
      wa.refreshConfig?.();
      clearParam("wa_connected");
    }

    if (params.get("wa_token_ready") === "true") {
      toast.success("Cuenta de Meta conectada. Selecciona tu número de WhatsApp.");
      clearParam("wa_token_ready");
      setWaWizardStartStep(2);
      setWaWizardOpen(true);
    }

    const waError = params.get("wa_error");
    if (waError) {
      toast.error("Error al conectar WhatsApp: " + decodeURIComponent(waError));
      clearParam("wa_error");
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // For non-real integrations, keep localStorage simulation
  const [otherConnectedIds, setOtherConnectedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("crm_connected_integrations") || "[]");
    } catch { return []; }
  });

  const isIntegrationConnected = (id: string) => {
    if (id === "google-calendar") return gcal.isConnected;
    if (id === "facebook") return fb.isConnected;
    if (id === "whatsapp") return wa.isConnected;
    if (id === "instagram") return ig.isConnected;
    return otherConnectedIds.includes(id);
  };

  const isIntegrationLoading = (id: string) => {
    if (id === "google-calendar") return gcal.connecting;
    if (id === "facebook") return fb.connecting;
    if (id === "whatsapp") return wa.connecting;
    if (id === "instagram") return ig.connecting;
    return false;
  };

  const toggleOtherConnection = (id: string) => {
    setOtherConnectedIds(prev => {
      const next = prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id];
      localStorage.setItem("crm_connected_integrations", JSON.stringify(next));
      return next;
    });
  };

  const handleConnect = (integration: Integration) => {
    if (integration.id === "google-calendar") {
      if (gcal.isConnected) gcal.disconnect();
      else gcal.connect();
    } else if (integration.id === "facebook") {
      if (fb.isConnected) fb.disconnect();
      else fb.connect();
    } else if (integration.id === "whatsapp") {
      if (wa.isConnected) wa.disconnect();
      else setWaWizardOpen(true);
    } else if (integration.id === "instagram") {
      setIgWizardOpen(true);
    } else {
      toggleOtherConnection(integration.id);
    }
  };

  const handleCardAction = (integration: Integration) => {
    if (integration.id === "facebook" && fb.isConnected) {
      setFbWizardOpen(true);
    } else if (integration.id === "whatsapp") {
      setWaWizardOpen(true);
    } else if (integration.id === "instagram") {
      setIgWizardOpen(true);
    } else if (isIntegrationConnected(integration.id)) {
      setSelectedIntegration(integration);
    } else {
      handleConnect(integration);
    }
  };

  return (
    <AppLayout>
      <AppHeader title="Integraciones" subtitle="Conecta tus herramientas favoritas" />
      <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.map((integration) => {
            const isConnected = isIntegrationConnected(integration.id);
            const isLoading = isIntegrationLoading(integration.id);
            return (
              <Card
                key={integration.id}
                className="border-none shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedIntegration(integration)}
              >
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between">
                    {/* Brand icons render their own colors via SVG gradients,
                        so we render the bigger size and skip the tinted bg */}
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted/30">
                      <integration.icon size={32} />
                    </div>
                    <Badge
                      variant={isConnected ? "default" : "secondary"}
                      className={`text-xs gap-1 ${isConnected ? "bg-green-600 hover:bg-green-600" : ""}`}
                    >
                      {isConnected ? <><CheckCircle2 className="h-3 w-3" /> Conectado</> : <><Circle className="h-3 w-3" /> Disponible</>}
                    </Badge>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{integration.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{integration.description}</p>
                  </div>

                  {/* Facebook status summary */}
                  {integration.id === "facebook" && fb.isConnected && fb.status && (
                    <div className="space-y-2">
                      {/* Reconnect banner: shown when the daily refresh job
                          flagged this token (user revoked permissions on the
                          Meta side, password change, etc.) */}
                      {fb.tokenHealth?.needs_reconnect && (
                        <div className="rounded-md border border-red-400 bg-red-50 dark:bg-red-950/30 p-2.5 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-start gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-red-600 mt-0.5 shrink-0" />
                            <p className="text-[11px] text-red-800 dark:text-red-300 leading-snug">
                              <span className="font-semibold">Reconexión necesaria.</span>{" "}
                              Tu token de Facebook ya no es válido (probablemente revocaste permisos o cambiaste contraseña). Los mensajes y leads dejarán de llegar hasta que reconectes.
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full text-xs gap-1.5 border-red-400 text-red-700 hover:bg-red-100"
                            onClick={async (e) => {
                              e.stopPropagation();
                              await fb.disconnect();
                              await fb.connect();
                            }}
                          >
                            Reconectar Facebook
                          </Button>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-xs">{fb.status.pages.length} páginas</Badge>
                        <Badge variant="outline" className="text-xs">{fb.status.forms.length} formularios</Badge>
                        <Badge variant="outline" className="text-xs">{fb.status.campaigns_count} campañas</Badge>
                      </div>
                    </div>
                  )}

                  {/* WhatsApp multi-number list */}
                  {integration.id === "whatsapp" && wa.isConnected && (
                    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                      {wa.configs.map((cfg) => (
                        <div
                          key={cfg.id}
                          className="flex items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-2"
                        >
                          {/* Primary star */}
                          {wa.configs.length > 1 && (
                            <button
                              title={cfg.is_primary ? "Número principal" : "Establecer como principal"}
                              onClick={() => wa.setPrimary(cfg.id)}
                              className="shrink-0 text-muted-foreground hover:text-amber-500 transition-colors"
                            >
                              <Star className={`h-3.5 w-3.5 ${cfg.is_primary ? "fill-amber-400 text-amber-400" : ""}`} />
                            </button>
                          )}

                          {/* Label / phone — inline edit */}
                          <div className="flex-1 min-w-0">
                            {editingLabelId === cfg.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  autoFocus
                                  value={editingLabelValue}
                                  onChange={(e) => setEditingLabelValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      wa.updateLabel(cfg.id, editingLabelValue);
                                      setEditingLabelId(null);
                                    }
                                    if (e.key === "Escape") setEditingLabelId(null);
                                  }}
                                  className="h-5 w-full rounded border bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                  placeholder="Ej: Ventas"
                                />
                                <button onClick={() => { wa.updateLabel(cfg.id, editingLabelValue); setEditingLabelId(null); }}>
                                  <Check className="h-3.5 w-3.5 text-green-600" />
                                </button>
                                <button onClick={() => setEditingLabelId(null)}>
                                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 min-w-0">
                                <span className="text-xs font-medium truncate">
                                  {cfg.label || cfg.display_phone || cfg.phone_number_id}
                                </span>
                                {cfg.label && cfg.display_phone && (
                                  <span className="text-[10px] text-muted-foreground truncate">· {cfg.display_phone}</span>
                                )}
                                {cfg.is_primary && wa.configs.length > 1 && (
                                  <span className="text-[10px] text-amber-600 font-medium shrink-0">Principal</span>
                                )}
                                <button
                                  onClick={() => { setEditingLabelId(cfg.id); setEditingLabelValue(cfg.label || ""); }}
                                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors ml-0.5"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Disconnect this number */}
                          <button
                            title="Desconectar este número"
                            onClick={() => wa.disconnect(cfg.id)}
                            className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}

                      {/* Add another number — triggers OAuth directly, no wizard */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs gap-1.5 h-7"
                        onClick={() => wa.connect()}
                      >
                        <Plus className="h-3.5 w-3.5" /> Conectar otro número
                      </Button>

                      {/* Wrong-app warning */}
                      {wrongAppWarning && (
                        <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2.5 space-y-1.5">
                          <div className="flex items-start gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                            <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-snug">
                              <span className="font-semibold">Los mensajes entrantes no llegarán.</span>{" "}
                              Tu conexión está vinculada a <span className="font-medium">"{wrongAppWarning.app_name}"</span>, no al CRM.
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full text-xs gap-1.5 border-amber-400 text-amber-700 hover:bg-amber-100"
                            onClick={(e) => { e.stopPropagation(); wa.disconnect().then(() => setWaWizardOpen(true)); }}
                          >
                            Reconectar correctamente
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Zap className="h-3 w-3" />
                    <span>{integration.features.length} funcionalidades</span>
                  </div>
                  <Button
                    size="sm"
                    variant={isConnected ? "outline" : "default"}
                    className="w-full"
                    disabled={isLoading}
                    onClick={(e) => { e.stopPropagation(); handleCardAction(integration); }}
                  >
                    {isLoading ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Conectando...</>
                    ) : isConnected ? (
                      <>{integration.id === "whatsapp" ? <>Gestionar <ArrowRight className="h-3.5 w-3.5 ml-1" /></> : integration.id === "facebook" ? <>Gestionar <ArrowRight className="h-3.5 w-3.5 ml-1" /></> : <>Ver detalles <ArrowRight className="h-3.5 w-3.5 ml-1" /></>}</>
                    ) : (
                      <>Conectar <ArrowRight className="h-3.5 w-3.5 ml-1" /></>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Webhooks */}
        <WebhooksSection />
      </main>

      {/* Facebook Setup Wizard */}
      <FacebookSetupWizard open={fbWizardOpen} onOpenChange={setFbWizardOpen} />

      {/* WhatsApp Setup Wizard */}
      <WhatsAppSetupWizard open={waWizardOpen} onOpenChange={(v) => { setWaWizardOpen(v); if (!v) { setWaWizardStartStep(1); wa.refreshConfig?.(); } }} startStep={waWizardStartStep} />

      {/* Instagram Setup Wizard */}
      <InstagramSetupWizard open={igWizardOpen} onOpenChange={(v) => { setIgWizardOpen(v); if (!v) ig.refresh(); }} />

      {/* Detail dialog (non-Facebook, non-WhatsApp) */}
      <Dialog open={!!selectedIntegration} onOpenChange={() => setSelectedIntegration(null)}>
        {selectedIntegration && (
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted/30">
                  <selectedIntegration.icon size={32} />
                </div>
                <div>
                  <DialogTitle>{selectedIntegration.name}</DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{selectedIntegration.description}</p>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-5 pt-2">
              {/* Status */}
              <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                <div className="flex items-center gap-2 text-sm">
                  {isIntegrationConnected(selectedIntegration.id) ? (
                    <><CheckCircle2 className="h-4 w-4 text-green-500" /><span className="font-medium text-foreground">Conectado</span></>
                  ) : (
                    <><Circle className="h-4 w-4 text-muted-foreground" /><span className="font-medium text-foreground">No conectado</span></>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={isIntegrationConnected(selectedIntegration.id) ? "destructive" : "default"}
                  disabled={isIntegrationLoading(selectedIntegration.id)}
                  onClick={() => {
                    if (selectedIntegration.id === "facebook" && !fb.isConnected) {
                      setSelectedIntegration(null);
                      fb.connect();
                    } else {
                      handleConnect(selectedIntegration);
                    }
                  }}
                >
                  {isIntegrationLoading(selectedIntegration.id) ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Conectando...</>
                  ) : isIntegrationConnected(selectedIntegration.id) ? "Desconectar" : "Conectar"}
                </Button>
              </div>

              {/* Google Calendar specific */}
              {selectedIntegration.id === "google-calendar" && gcal.isConnected && (
                <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-3">
                  <p className="text-sm text-green-700 dark:text-green-400">
                    ✅ Las reuniones que crees en el CRM se agregarán automáticamente a tu Google Calendar.
                  </p>
                </div>
              )}

              {/* Facebook: open wizard button */}
              {selectedIntegration.id === "facebook" && fb.isConnected && (
                <Button variant="outline" className="w-full" onClick={() => { setSelectedIntegration(null); setFbWizardOpen(true); }}>
                  Gestionar páginas, formularios y campañas
                </Button>
              )}

              {/* Features */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5" /> Funcionalidades
                </h4>
                <ul className="space-y-1.5">
                  {selectedIntegration.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Setup steps */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" /> Pasos de configuración
                </h4>
                <ol className="space-y-2">
                  {selectedIntegration.setupSteps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">{i + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Requirements */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Requisitos</h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectedIntegration.requirements.map((req, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{req}</Badge>
                  ))}
                </div>
              </div>

              <a href={selectedIntegration.docsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                <ExternalLink className="h-3.5 w-3.5" />
                Ver documentación oficial
              </a>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </AppLayout>
  );
}
