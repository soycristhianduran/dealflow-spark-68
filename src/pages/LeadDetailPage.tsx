import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mockLeads, mockActivities } from "@/data/mock-data";
import { useParams, useNavigate } from "react-router-dom";
import { Phone, Mail, ArrowLeft, Globe, MapPin, Megaphone, Target, BarChart3, Calendar } from "lucide-react";
import { ActivityTimeline } from "@/components/crm/ActivityTimeline";

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  new: { label: "Nuevo", variant: "default" },
  contacted: { label: "Contactado", variant: "secondary" },
  qualified: { label: "Calificado", variant: "outline" },
  converted: { label: "Convertido", variant: "default" },
  lost: { label: "Perdido", variant: "destructive" },
};

export default function LeadDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const lead = mockLeads.find(l => l.id === id);

  if (!lead) {
    return (
      <AppLayout>
        <AppHeader title="Lead no encontrado" />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">El lead no existe.</p>
        </main>
      </AppLayout>
    );
  }

  const status = statusMap[lead.status] || statusMap.new;
  const leadActivities = mockActivities.filter(a =>
    a.related_entity_type === 'lead' && a.related_entity_id === lead.id
  );

  return (
    <AppLayout>
      <AppHeader
        title={lead.full_name}
        subtitle={`Lead · ${status.label}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/leads')} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
            <Button size="sm">Convertir a contacto</Button>
          </div>
        }
      />
      <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Lead info sidebar */}
          <div className="space-y-4">
            <Card className="border-none shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <Avatar className="h-14 w-14">
                    <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                      {lead.full_name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">{lead.full_name}</h2>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                </div>
                <div className="space-y-3">
                  {lead.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-foreground">{lead.phone}</span>
                    </div>
                  )}
                  {lead.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-foreground">{lead.email}</span>
                    </div>
                  )}
                  {(lead.city || lead.country) && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="text-foreground">{[lead.city, lead.country].filter(Boolean).join(', ')}</span>
                    </div>
                  )}
                </div>

                {/* Score */}
                <div className="mt-4 p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Score</span>
                    <span className="text-sm font-bold text-foreground">{lead.score || 0}/100</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${lead.score || 0}%` }} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick actions */}
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Acciones rápidas</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="gap-1.5"><Phone className="h-3.5 w-3.5" /> Llamar</Button>
                <Button variant="outline" size="sm" className="gap-1.5"><Mail className="h-3.5 w-3.5" /> Email</Button>
                <Button variant="outline" size="sm" className="gap-1.5"><Calendar className="h-3.5 w-3.5" /> Agendar</Button>
                <Button variant="outline" size="sm" className="gap-1.5"><Target className="h-3.5 w-3.5" /> Calificar</Button>
              </CardContent>
            </Card>
          </div>

          {/* Main content */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="info">
              <TabsList>
                <TabsTrigger value="info">Información</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="mt-4 space-y-4">
                {/* Marketing / Acquisition */}
                <Card className="border-none shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Megaphone className="h-3.5 w-3.5" /> Origen y campaña
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <InfoItem label="Origen" value={lead.source} />
                      <InfoItem label="Campaña" value={lead.campaign} />
                      <InfoItem label="Ad Set" value={lead.adset} />
                      <InfoItem label="Anuncio" value={lead.ad} />
                      <InfoItem label="Landing Page" value={lead.landing_page} />
                    </div>
                  </CardContent>
                </Card>

                {/* UTM Parameters */}
                {(lead.utm_source || lead.utm_medium || lead.utm_campaign || lead.utm_content) && (
                  <Card className="border-none shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <BarChart3 className="h-3.5 w-3.5" /> Parámetros UTM
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <InfoItem label="utm_source" value={lead.utm_source} />
                        <InfoItem label="utm_medium" value={lead.utm_medium} />
                        <InfoItem label="utm_campaign" value={lead.utm_campaign} />
                        <InfoItem label="utm_content" value={lead.utm_content} />
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Dates */}
                <Card className="border-none shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fechas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <InfoItem label="Creado" value={new Date(lead.created_at).toLocaleString()} />
                      <InfoItem label="Actualizado" value={new Date(lead.updated_at).toLocaleString()} />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="timeline" className="mt-4">
                {leadActivities.length > 0 ? (
                  <ActivityTimeline activities={leadActivities} />
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <p className="text-sm">No hay actividad registrada para este lead.</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </AppLayout>
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
