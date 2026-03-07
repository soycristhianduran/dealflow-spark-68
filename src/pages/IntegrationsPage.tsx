import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarDays, MessageCircle, Facebook, Instagram, Music2, CheckCircle2, Circle, ExternalLink, Shield, Zap, ArrowRight } from "lucide-react";
import { useState } from "react";

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
      "Sincronización bidireccional de citas",
      "Creación automática de eventos al agendar reuniones",
      "Notificaciones y recordatorios",
      "Disponibilidad en tiempo real",
    ],
    setupSteps: [
      "Haz clic en 'Conectar' para iniciar sesión con tu cuenta de Google",
      "Autoriza el acceso a Google Calendar",
      "Selecciona los calendarios que deseas sincronizar",
      "¡Listo! Tus citas se sincronizarán automáticamente",
    ],
    requirements: ["Cuenta de Google activa", "Permisos de calendario"],
    docsUrl: "https://calendar.google.com",
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
    id: "facebook",
    name: "Facebook Ads",
    description: "Conecta tus campañas de Facebook Ads y captura leads automáticamente.",
    icon: Facebook,
    color: "hsl(221, 44%, 41%)",
    features: [
      "Captura automática de leads desde Lead Ads",
      "Sincronización de formularios de Facebook",
      "Tracking de campañas y atribución",
      "Audiencias personalizadas desde el CRM",
    ],
    setupSteps: [
      "Inicia sesión con tu cuenta de Facebook Business",
      "Selecciona la página y cuenta publicitaria",
      "Autoriza el acceso a tus formularios de leads",
      "Configura el mapeo de campos del formulario",
    ],
    requirements: ["Cuenta de Facebook Business", "Página de Facebook activa", "Cuenta publicitaria configurada"],
    docsUrl: "https://business.facebook.com",
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
  // Simulated connection states stored in localStorage
  const [connectedIds, setConnectedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("crm_connected_integrations") || "[]");
    } catch { return []; }
  });

  const toggleConnection = (id: string) => {
    setConnectedIds(prev => {
      const next = prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id];
      localStorage.setItem("crm_connected_integrations", JSON.stringify(next));
      return next;
    });
  };

  return (
    <AppLayout>
      <AppHeader title="Integraciones" subtitle="Conecta tus herramientas favoritas" />
      <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.map((integration) => {
            const isConnected = connectedIds.includes(integration.id);
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
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Zap className="h-3 w-3" />
                    <span>{integration.features.length} funcionalidades</span>
                  </div>
                  <Button
                    size="sm"
                    variant={isConnected ? "outline" : "default"}
                    className="w-full"
                    onClick={(e) => { e.stopPropagation(); setSelectedIntegration(integration); }}
                  >
                    {isConnected ? "Ver detalles" : "Conectar"}
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>

      {/* Detail dialog */}
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
                  {connectedIds.includes(selectedIntegration.id) ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="font-medium text-foreground">Conectado</span>
                    </>
                  ) : (
                    <>
                      <Circle className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-foreground">No conectado</span>
                    </>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={connectedIds.includes(selectedIntegration.id) ? "destructive" : "default"}
                  onClick={() => toggleConnection(selectedIntegration.id)}
                >
                  {connectedIds.includes(selectedIntegration.id) ? "Desconectar" : "Conectar"}
                </Button>
              </div>

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

              {/* Docs link */}
              <a
                href={selectedIntegration.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
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
