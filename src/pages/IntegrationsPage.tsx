import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, MessageCircle, Facebook, Instagram, Music2 } from "lucide-react";

const integrations = [
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Sincroniza tus citas y reuniones automáticamente con Google Calendar.",
    icon: CalendarDays,
    color: "hsl(217, 91%, 60%)",
    status: "available" as const,
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Envía y recibe mensajes de WhatsApp directamente desde tu CRM.",
    icon: MessageCircle,
    color: "hsl(142, 70%, 45%)",
    status: "coming_soon" as const,
  },
  {
    id: "facebook",
    name: "Facebook",
    description: "Conecta tus campañas de Facebook Ads y captura leads automáticamente.",
    icon: Facebook,
    color: "hsl(221, 44%, 41%)",
    status: "coming_soon" as const,
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Recibe mensajes de Instagram Direct y gestiona leads desde la plataforma.",
    icon: Instagram,
    color: "hsl(340, 75%, 55%)",
    status: "coming_soon" as const,
  },
  {
    id: "tiktok",
    name: "TikTok",
    description: "Integra TikTok Ads para capturar leads de tus campañas de video.",
    icon: Music2,
    color: "hsl(0, 0%, 10%)",
    status: "coming_soon" as const,
  },
];

export default function IntegrationsPage() {
  return (
    <AppLayout>
      <AppHeader title="Integraciones" subtitle="Conecta tus herramientas favoritas" />
      <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.map((integration) => (
            <Card key={integration.id} className="border-none shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ backgroundColor: `${integration.color}20` }}>
                    <integration.icon className="h-5 w-5" style={{ color: integration.color }} />
                  </div>
                  <Badge
                    variant={integration.status === "available" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {integration.status === "available" ? "Disponible" : "Próximamente"}
                  </Badge>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{integration.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{integration.description}</p>
                </div>
                <Button
                  size="sm"
                  variant={integration.status === "available" ? "default" : "outline"}
                  className="w-full"
                  disabled={integration.status === "coming_soon"}
                >
                  {integration.status === "available" ? "Conectar" : "Próximamente"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </AppLayout>
  );
}
