import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarDays, MessageCircle, Facebook, Instagram, Music2, CheckCircle2, Circle, ExternalLink, Shield, Zap, ArrowRight, Loader2, Bell } from "lucide-react";
import { useState } from "react";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { useFacebookIntegration } from "@/hooks/useFacebookIntegration";
import { useWhatsAppIntegration } from "@/hooks/useWhatsAppIntegration";
import { FacebookSetupWizard } from "@/components/crm/FacebookSetupWizard";
import { WhatsAppSetupWizard } from "@/components/crm/WhatsAppSetupWizard";

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
    icon: CalendarDays,
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
    icon: Facebook,
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
    icon: MessageCircle,
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
    icon: Instagram,
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
    icon: Music2,
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

export default function IntegrationsPage() {
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [fbWizardOpen, setFbWizardOpen] = useState(false);
  const [waWizardOpen, setWaWizardOpen] = useState(false);
  const gcal = useGoogleCalendar();
  const fb = useFacebookIntegration();
  const wa = useWhatsAppIntegration();

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
    return otherConnectedIds.includes(id);
  };

  const isIntegrationLoading = (id: string) => {
    if (id === "google-calendar") return gcal.connecting;
    if (id === "facebook") return fb.connecting;
    if (id === "whatsapp") return wa.saving;
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
    } else {
      toggleOtherConnection(integration.id);
    }
  };

  const handleCardAction = (integration: Integration) => {
    if (integration.id === "facebook" && fb.isConnected) {
      setFbWizardOpen(true);
    } else if (integration.id === "whatsapp") {
      setWaWizardOpen(true);
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
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ backgroundColor: `${integration.color}20` }}>
                      <integration.icon className="h-5 w-5" style={{ color: integration.color }} />
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
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-xs">{fb.status.pages.length} páginas</Badge>
                        <Badge variant="outline" className="text-xs">{fb.status.forms.length} formularios</Badge>
                        <Badge variant="outline" className="text-xs">{fb.status.campaigns_count} campañas</Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs gap-1.5"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await fb.subscribeLeadgen();
                        }}
                      >
                        <Bell className="h-3 w-3" /> Suscribir páginas a Leadgen
                      </Button>
                    </div>
                  )}

                  {/* WhatsApp status summary */}
                  {integration.id === "whatsapp" && wa.isConnected && wa.config && (
                    <div className="flex flex-wrap gap-1.5">
                      {wa.config.business_name && <Badge variant="outline" className="text-xs">{wa.config.business_name}</Badge>}
                      {wa.config.display_phone && <Badge variant="outline" className="text-xs">{wa.config.display_phone}</Badge>}
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
                      <>{(integration.id === "facebook" || integration.id === "whatsapp") ? "Gestionar" : "Ver detalles"} <ArrowRight className="h-3.5 w-3.5 ml-1" /></>
                    ) : (
                      <>Conectar <ArrowRight className="h-3.5 w-3.5 ml-1" /></>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>

      {/* Facebook Setup Wizard */}
      <FacebookSetupWizard open={fbWizardOpen} onOpenChange={setFbWizardOpen} />

      {/* Detail dialog (non-Facebook) */}
      <Dialog open={!!selectedIntegration} onOpenChange={() => setSelectedIntegration(null)}>
        {selectedIntegration && (
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ backgroundColor: `${selectedIntegration.color}20` }}>
                  <selectedIntegration.icon className="h-5 w-5" style={{ color: selectedIntegration.color }} />
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
