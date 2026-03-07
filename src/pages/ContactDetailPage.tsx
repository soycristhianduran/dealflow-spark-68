import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mockContacts, mockDeals, mockTasks, mockMeetings, mockActivities } from "@/data/mock-data";
import { useParams, useNavigate } from "react-router-dom";
import { Phone, Mail, Building2, ArrowLeft, MessageCircle, Calendar, Globe } from "lucide-react";
import { ActivityTimeline } from "@/components/crm/ActivityTimeline";

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
                    {contact.company && <p className="text-sm text-muted-foreground">{contact.company.name}</p>}
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
                </div>
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
                <TabsTrigger value="deals">Deals ({contactDeals.length})</TabsTrigger>
                <TabsTrigger value="tasks">Tareas ({contactTasks.length})</TabsTrigger>
                <TabsTrigger value="meetings">Citas ({contactMeetings.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="timeline" className="mt-4">
                <ActivityTimeline activities={contactActivities} />
              </TabsContent>

              <TabsContent value="deals" className="mt-4 space-y-3">
                {contactDeals.map(deal => (
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
                ))}
              </TabsContent>

              <TabsContent value="tasks" className="mt-4 space-y-2">
                {contactTasks.map(task => (
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
                ))}
              </TabsContent>

              <TabsContent value="meetings" className="mt-4 space-y-3">
                {contactMeetings.map(meeting => (
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
                ))}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </AppLayout>
  );
}
