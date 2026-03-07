import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mockContacts, mockDeals, mockTasks, mockMeetings, mockActivities } from "@/data/mock-data";
import { useParams, useNavigate } from "react-router-dom";
import { Phone, Mail, Building2, ArrowLeft, MessageCircle, Calendar, MapPin, Megaphone, BarChart3, Target } from "lucide-react";
import { ActivityTimeline } from "@/components/crm/ActivityTimeline";
import type { ContactStatus } from "@/types/crm";

const statusConfig: Record<ContactStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  new: { label: "Nuevo", variant: "default" },
  contacted: { label: "Contactado", variant: "secondary" },
  qualified: { label: "Calificado", variant: "outline" },
  client: { label: "Cliente", variant: "default" },
  lost: { label: "Perdido", variant: "destructive" },
};

export default function ContactDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const contact = mockContacts.find(c => c.id === id);

  if (!contact) {
    return (
      <AppLayout>
        <AppHeader title="Contacto no encontrado" />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">El contacto no existe.</p>
        </main>
      </AppLayout>
    );
  }

  const status = statusConfig[contact.status];
  const contactDeals = mockDeals.filter(d => d.contact_id === contact.id);
  const contactTasks = mockTasks.filter(t => t.contact_id === contact.id);
  const contactMeetings = mockMeetings.filter(m => m.contact_id === contact.id);
  const contactActivities = mockActivities.filter(a =>
    (a.related_entity_type === 'contact' && a.related_entity_id === contact.id) ||
    contactDeals.some(d => a.related_entity_id === d.id)
  );

  return (
    <AppLayout>
      <AppHeader
        title={contact.full_name}
        subtitle={contact.company?.name}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/contacts')} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
        }
      />
      <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Contact info sidebar */}
          <div className="space-y-4">
            <Card className="border-none shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <Avatar className="h-14 w-14">
                    <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                      {contact.full_name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">{contact.full_name}</h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {contact.company && <span className="text-sm text-muted-foreground">{contact.company.name}</span>}
                    </div>
                  </div>
                </div>
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
                  {contact.preferred_channel && (
                    <div className="flex items-center gap-2 text-sm">
                      <MessageCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-foreground capitalize">{contact.preferred_channel}</span>
                    </div>
                  )}
                  {(contact.city || contact.country) && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="text-foreground">{[contact.city, contact.country].filter(Boolean).join(', ')}</span>
                    </div>
                  )}
                </div>

                {/* Score */}
                {contact.score != null && (
                  <div className="mt-4 p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Score</span>
                      <span className="text-sm font-bold text-foreground">{contact.score}/100</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${contact.score}%` }} />
                    </div>
                  </div>
                )}

                {contact.tags && contact.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {contact.tags.map(tag => (
                      <Badge key={tag} variant="secondary">{tag}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick actions */}
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Acciones rápidas</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="gap-1.5"><Phone className="h-3.5 w-3.5" /> Llamar</Button>
                <Button variant="outline" size="sm" className="gap-1.5"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</Button>
                <Button variant="outline" size="sm" className="gap-1.5"><Mail className="h-3.5 w-3.5" /> Email</Button>
                <Button variant="outline" size="sm" className="gap-1.5"><Calendar className="h-3.5 w-3.5" /> Agendar</Button>
              </CardContent>
            </Card>
          </div>

          {/* Main content with tabs */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="timeline">
              <TabsList>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="info">Info</TabsTrigger>
                <TabsTrigger value="deals">Deals ({contactDeals.length})</TabsTrigger>
                <TabsTrigger value="tasks">Tareas ({contactTasks.length})</TabsTrigger>
                <TabsTrigger value="meetings">Citas ({contactMeetings.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="timeline" className="mt-4">
                {contactActivities.length > 0 ? (
                  <ActivityTimeline activities={contactActivities} />
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <p className="text-sm">No hay actividad registrada.</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="info" className="mt-4 space-y-4">
                {/* Marketing / Acquisition */}
                {contact.source && (
                  <Card className="border-none shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Megaphone className="h-3.5 w-3.5" /> Origen y campaña
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <InfoItem label="Origen" value={contact.source} />
                        <InfoItem label="Campaña" value={contact.campaign} />
                        <InfoItem label="Ad Set" value={contact.adset} />
                        <InfoItem label="Anuncio" value={contact.ad} />
                        <InfoItem label="Landing Page" value={contact.landing_page} />
                      </div>
                    </CardContent>
                  </Card>
                )}

                {(contact.utm_source || contact.utm_medium || contact.utm_campaign) && (
                  <Card className="border-none shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <BarChart3 className="h-3.5 w-3.5" /> UTM
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <InfoItem label="utm_source" value={contact.utm_source} />
                        <InfoItem label="utm_medium" value={contact.utm_medium} />
                        <InfoItem label="utm_campaign" value={contact.utm_campaign} />
                        <InfoItem label="utm_content" value={contact.utm_content} />
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card className="border-none shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fechas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <InfoItem label="Creado" value={new Date(contact.created_at).toLocaleString()} />
                      <InfoItem label="Actualizado" value={new Date(contact.updated_at).toLocaleString()} />
                      <InfoItem label="Último contacto" value={contact.last_contact_at ? new Date(contact.last_contact_at).toLocaleString() : undefined} />
                      <InfoItem label="Próxima acción" value={contact.next_action_at ? new Date(contact.next_action_at).toLocaleString() : undefined} />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="deals" className="mt-4 space-y-3">
                {contactDeals.length > 0 ? contactDeals.map(deal => (
                  <Card key={deal.id} className="border shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/deals/${deal.id}`)}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{deal.title}</p>
                        <Badge variant="outline" className="mt-1 text-xs" style={{ borderColor: deal.stage?.color, color: deal.stage?.color }}>
                          {deal.stage?.name}
                        </Badge>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-foreground">${deal.value.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{deal.currency}</p>
                      </div>
                    </CardContent>
                  </Card>
                )) : (
                  <div className="text-center py-12 text-muted-foreground text-sm">Sin deals asociados</div>
                )}
              </TabsContent>

              <TabsContent value="tasks" className="mt-4 space-y-2">
                {contactTasks.length > 0 ? contactTasks.map(task => (
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
                  <div className="text-center py-12 text-muted-foreground text-sm">Sin tareas asociadas</div>
                )}
              </TabsContent>

              <TabsContent value="meetings" className="mt-4 space-y-3">
                {contactMeetings.length > 0 ? contactMeetings.map(meeting => (
                  <Card key={meeting.id} className="border shadow-sm">
                    <CardContent className="p-4">
                      <p className="text-sm font-medium text-foreground">{meeting.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(meeting.start_at).toLocaleString()} - {new Date(meeting.end_at).toLocaleTimeString()}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="outline" className="text-xs">{meeting.status}</Badge>
                        {meeting.meeting_type && <Badge variant="secondary" className="text-xs">{meeting.meeting_type}</Badge>}
                      </div>
                    </CardContent>
                  </Card>
                )) : (
                  <div className="text-center py-12 text-muted-foreground text-sm">Sin citas asociadas</div>
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
