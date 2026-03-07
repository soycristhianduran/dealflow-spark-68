import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { dashboardStats, mockDeals, mockTasks, mockMeetings, mockActivities } from "@/data/mock-data";
import { 
  Users, Handshake, Trophy, XCircle, DollarSign, 
  CalendarDays, CalendarCheck, UserX, CheckSquare,
  TrendingUp, ArrowUpRight, UserPlus, Star
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const stats = [
  { label: "Contactos", value: dashboardStats.contactsTotal, icon: Users, trend: "+12%" },
  { label: "Nuevos", value: dashboardStats.contactsNew, icon: UserPlus },
  { label: "Calificados", value: dashboardStats.contactsQualified, icon: Star },
  { label: "Deals abiertos", value: dashboardStats.dealsOpen, icon: Handshake },
  { label: "Deals ganados", value: dashboardStats.dealsWon, icon: Trophy, trend: "+2" },
  { label: "Deals perdidos", value: dashboardStats.dealsLost, icon: XCircle },
  { label: "Valor pipeline", value: `$${(dashboardStats.pipelineValue / 1000).toFixed(0)}K`, icon: DollarSign, trend: "+15%" },
  { label: "Citas agendadas", value: dashboardStats.meetingsScheduled, icon: CalendarDays },
  { label: "Citas realizadas", value: dashboardStats.meetingsCompleted, icon: CalendarCheck },
  { label: "Tareas pendientes", value: dashboardStats.tasksPending, icon: CheckSquare },
];

const eventTypeIcons: Record<string, string> = {
  call: '📞', whatsapp: '💬', email: '✉️', meeting: '📅',
  stage_change: '🔄', note: '📝', deal_created: '🤝', system: '⚙️', task_created: '✅'
};

export default function DashboardPage() {
  const upcomingMeetings = mockMeetings.filter(m => m.status === 'scheduled').slice(0, 3);
  const urgentTasks = mockTasks.filter(t => t.status === 'pending').slice(0, 4);
  const recentActivity = mockActivities.slice(0, 6);

  return (
    <AppLayout>
      <AppHeader title="Dashboard" subtitle={format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })} />
      <main className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {stats.map((stat) => (
            <Card key={stat.label} className="border-none shadow-sm">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <stat.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{stat.label}</p>
                  <div className="flex items-baseline gap-1.5">
                    <p className="text-xl font-bold text-foreground">{stat.value}</p>
                    {stat.trend && (
                      <span className="flex items-center text-xs font-medium text-success">
                        <ArrowUpRight className="h-3 w-3" />
                        {stat.trend}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                Próximas citas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingMeetings.map((meeting) => (
                <div key={meeting.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">{format(new Date(meeting.start_at), 'MMM', { locale: es })}</p>
                    <p className="text-lg font-bold text-foreground">{format(new Date(meeting.start_at), 'd')}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{meeting.title}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(meeting.start_at), 'HH:mm')} - {meeting.contact?.full_name}</p>
                    <Badge variant="outline" className="mt-1 text-xs">{meeting.meeting_type}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-primary" />
                Tareas pendientes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {urgentTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className={`h-2 w-2 rounded-full shrink-0 ${
                    task.priority === 'urgent' ? 'bg-destructive' :
                    task.priority === 'high' ? 'bg-warning' :
                    task.priority === 'medium' ? 'bg-primary' : 'bg-muted-foreground'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                    <p className="text-xs text-muted-foreground">{task.due_date} {task.due_time && `· ${task.due_time}`}</p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">{task.task_type}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Actividad reciente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-start gap-2 py-2 border-b last:border-0">
                  <span className="text-sm shrink-0">{eventTypeIcons[activity.event_type] || '📋'}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{activity.summary}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(activity.created_at), "d MMM, HH:mm", { locale: es })}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Handshake className="h-4 w-4 text-primary" />
              Deals activos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Deal</th>
                    <th className="pb-2 font-medium text-muted-foreground">Contacto</th>
                    <th className="pb-2 font-medium text-muted-foreground">Etapa</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Valor</th>
                    <th className="pb-2 font-medium text-muted-foreground">Cierre esperado</th>
                  </tr>
                </thead>
                <tbody>
                  {mockDeals.filter(d => d.status === 'open').map((deal) => (
                    <tr key={deal.id} className="border-b last:border-0">
                      <td className="py-3 font-medium text-foreground">{deal.title}</td>
                      <td className="py-3 text-muted-foreground">{deal.contact?.full_name || '-'}</td>
                      <td className="py-3">
                        <Badge variant="outline" className="text-xs" style={{ borderColor: deal.stage?.color, color: deal.stage?.color }}>
                          {deal.stage?.name}
                        </Badge>
                      </td>
                      <td className="py-3 text-right font-medium text-foreground">${deal.value.toLocaleString()} {deal.currency}</td>
                      <td className="py-3 text-muted-foreground">{deal.expected_close_date || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </AppLayout>
  );
}
