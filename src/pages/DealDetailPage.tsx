import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mockDeals, mockTasks, mockMeetings, mockActivities, defaultStages } from "@/data/mock-data";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, DollarSign, Calendar, User, Building2, Target } from "lucide-react";
import { ActivityTimeline } from "@/components/crm/ActivityTimeline";

export default function DealDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const deal = mockDeals.find(d => d.id === id);

  if (!deal) {
    return (
      <AppLayout>
        <AppHeader title="Deal no encontrado" />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">El deal no existe.</p>
        </main>
      </AppLayout>
    );
  }

  const dealTasks = mockTasks.filter(t => t.deal_id === deal.id);
  const dealMeetings = mockMeetings.filter(m => m.deal_id === deal.id);
  const dealActivities = mockActivities.filter(a => a.related_entity_id === deal.id);

  return (
    <AppLayout>
      <AppHeader
        title={deal.title}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/deals')} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
        }
      />
      <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Deal info */}
          <div className="space-y-4">
            <Card className="border-none shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-sm" style={{ borderColor: deal.stage?.color, color: deal.stage?.color }}>
                    {deal.stage?.name}
                  </Badge>
                  <Badge variant={deal.status === 'won' ? 'default' : deal.status === 'lost' ? 'destructive' : 'secondary'}>
                    {deal.status === 'won' ? 'Ganado' : deal.status === 'lost' ? 'Perdido' : 'Abierto'}
                  </Badge>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-lg font-bold text-foreground">${deal.value.toLocaleString()} {deal.currency}</span>
                  </div>
                  {deal.contact && (
                    <div className="flex items-center gap-2 text-sm cursor-pointer" onClick={() => navigate(`/contacts/${deal.contact_id}`)}>
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-primary hover:underline">{deal.contact.full_name}</span>
                    </div>
                  )}
                  {deal.expected_close_date && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-foreground">{deal.expected_close_date}</span>
                    </div>
                  )}
                  {deal.close_probability !== undefined && (
                    <div className="flex items-center gap-2 text-sm">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <span className="text-foreground">{deal.close_probability}% probabilidad</span>
                    </div>
                  )}
                  {deal.source && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Origen: </span>
                      <span className="text-foreground">{deal.source}</span>
                    </div>
                  )}
                  {deal.product && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Producto: </span>
                      <span className="text-foreground">{deal.product}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Pipeline progress */}
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Progreso pipeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {defaultStages.filter(s => s.id !== 's8').map(stage => (
                  <div key={stage.id} className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${stage.order <= (deal.stage?.order || 0) ? '' : 'opacity-30'}`} style={{ backgroundColor: stage.color }} />
                    <span className={`text-xs ${stage.id === deal.stage_id ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                      {stage.name}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Main content */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="timeline">
              <TabsList>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="tasks">Tareas ({dealTasks.length})</TabsTrigger>
                <TabsTrigger value="meetings">Citas ({dealMeetings.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="timeline" className="mt-4">
                <ActivityTimeline activities={dealActivities} />
              </TabsContent>

              <TabsContent value="tasks" className="mt-4 space-y-2">
                {dealTasks.map(task => (
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
                {dealTasks.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Sin tareas</p>}
              </TabsContent>

              <TabsContent value="meetings" className="mt-4 space-y-3">
                {dealMeetings.map(meeting => (
                  <Card key={meeting.id} className="border shadow-sm">
                    <CardContent className="p-4">
                      <p className="text-sm font-medium text-foreground">{meeting.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(meeting.start_at).toLocaleString()}
                      </p>
                      <Badge variant="outline" className="mt-2 text-xs">{meeting.status}</Badge>
                    </CardContent>
                  </Card>
                ))}
                {dealMeetings.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Sin citas</p>}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </AppLayout>
  );
}
