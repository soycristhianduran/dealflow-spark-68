import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState, useCallback } from "react";
import {
  Users, Handshake, Trophy, XCircle, DollarSign,
  CalendarDays, CalendarCheck, CheckSquare,
  TrendingUp, ArrowUpRight, UserPlus, Star, Loader2
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface DashboardStats {
  contactsTotal: number;
  contactsNew: number;
  contactsQualified: number;
  dealsOpen: number;
  dealsWon: number;
  dealsLost: number;
  pipelineValue: number;
  pipelineCurrency: string;
  wonValue: number;
  wonCurrency: string;
  meetingsScheduled: number;
  meetingsCompleted: number;
  tasksPending: number;
}

interface MeetingRow {
  id: string;
  title: string;
  start_at: string;
  meeting_type: string | null;
  contact_name: string | null;
}

interface TaskRow {
  id: string;
  title: string;
  priority: string;
  task_type: string;
  due_date: string | null;
  due_time: string | null;
}

interface ActivityRow {
  id: string;
  event_type: string;
  summary: string;
  created_at: string;
}

interface DealRow {
  id: string;
  title: string;
  value: number;
  currency: string;
  status: string;
  expected_close_date: string | null;
  contact_name: string | null;
  stage_name: string | null;
  stage_color: string | null;
}

const eventTypeIcons: Record<string, string> = {
  call: '📞', whatsapp: '💬', email: '✉️', meeting: '📅',
  stage_change: '🔄', note: '📝', deal_created: '🤝', system: '⚙️', task_created: '✅'
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    contactsTotal: 0, contactsNew: 0, contactsQualified: 0,
    dealsOpen: 0, dealsWon: 0, dealsLost: 0,
    pipelineValue: 0, pipelineCurrency: 'USD',
    meetingsScheduled: 0, meetingsCompleted: 0, tasksPending: 0,
  });
  const [upcomingMeetings, setUpcomingMeetings] = useState<MeetingRow[]>([]);
  const [pendingTasks, setPendingTasks] = useState<TaskRow[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityRow[]>([]);
  const [activeDeals, setActiveDeals] = useState<DealRow[]>([]);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);

    const [
      contactsRes,
      dealsRes,
      meetingsRes,
      tasksRes,
      activitiesRes,
      upcomingRes,
      pendingTasksRes,
      activeDealsRes,
    ] = await Promise.all([
      supabase.from("contacts").select("id, status"),
      supabase.from("deals").select("id, status, value, currency"),
      supabase.from("meetings").select("id, status"),
      supabase.from("tasks").select("id, status"),
      supabase.from("activities").select("id, event_type, summary, created_at").order("created_at", { ascending: false }).limit(6),
      supabase.from("meetings").select("id, title, start_at, meeting_type, contacts(full_name)")
        .eq("status", "scheduled").gte("start_at", new Date().toISOString()).order("start_at").limit(3),
      supabase.from("tasks").select("id, title, priority, task_type, due_date, due_time")
        .eq("status", "pending").order("due_date").limit(4),
      supabase.from("deals").select("id, title, value, currency, expected_close_date, contacts(full_name), pipeline_stages(name, color)")
        .eq("status", "open").order("created_at", { ascending: false }).limit(10),
    ]);

    const contacts = contactsRes.data || [];
    const deals = dealsRes.data || [];
    const meetings = meetingsRes.data || [];
    const tasks = tasksRes.data || [];

    const openDeals = deals.filter(d => d.status === "open");
    const pipelineValue = openDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);
    const mainCurrency = openDeals.length > 0 ? openDeals[0].currency : "USD";

    setStats({
      contactsTotal: contacts.length,
      contactsNew: contacts.filter(c => c.status === "new").length,
      contactsQualified: contacts.filter(c => c.status === "qualified").length,
      dealsOpen: openDeals.length,
      dealsWon: deals.filter(d => d.status === "won").length,
      dealsLost: deals.filter(d => d.status === "lost").length,
      pipelineValue,
      pipelineCurrency: mainCurrency,
      meetingsScheduled: meetings.filter(m => m.status === "scheduled").length,
      meetingsCompleted: meetings.filter(m => m.status === "completed").length,
      tasksPending: tasks.filter(t => t.status === "pending").length,
    });

    setRecentActivity((activitiesRes.data || []) as ActivityRow[]);

    setUpcomingMeetings((upcomingRes.data || []).map((m: any) => ({
      id: m.id, title: m.title, start_at: m.start_at, meeting_type: m.meeting_type,
      contact_name: m.contacts?.full_name || null,
    })));

    setPendingTasks((pendingTasksRes.data || []) as TaskRow[]);

    setActiveDeals((activeDealsRes.data || []).map((d: any) => ({
      id: d.id, title: d.title, value: d.value, currency: d.currency,
      expected_close_date: d.expected_close_date,
      contact_name: d.contacts?.full_name || null,
      stage_name: d.pipeline_stages?.name || null,
      stage_color: d.pipeline_stages?.color || null,
    })));

    setLoading(false);
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const formatValue = (value: number, currency: string) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M ${currency}`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K ${currency}`;
    return `${value.toLocaleString()} ${currency}`;
  };

  const statCards = [
    { label: "Contactos", value: stats.contactsTotal, icon: Users },
    { label: "Nuevos", value: stats.contactsNew, icon: UserPlus },
    { label: "Calificados", value: stats.contactsQualified, icon: Star },
    { label: "Deals abiertos", value: stats.dealsOpen, icon: Handshake },
    { label: "Deals ganados", value: stats.dealsWon, icon: Trophy },
    { label: "Deals perdidos", value: stats.dealsLost, icon: XCircle },
    { label: "Valor pipeline", value: formatValue(stats.pipelineValue, stats.pipelineCurrency), icon: DollarSign },
    { label: "Citas agendadas", value: stats.meetingsScheduled, icon: CalendarDays },
    { label: "Citas realizadas", value: stats.meetingsCompleted, icon: CalendarCheck },
    { label: "Tareas pendientes", value: stats.tasksPending, icon: CheckSquare },
  ];

  if (loading) {
    return (
      <AppLayout>
        <AppHeader title="Dashboard" subtitle={format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })} />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </main>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AppHeader title="Dashboard" subtitle={format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })} />
      <main className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {statCards.map((stat) => (
            <Card key={stat.label} className="border-none shadow-sm">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <stat.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{stat.label}</p>
                  <p className="text-xl font-bold text-foreground">{stat.value}</p>
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
              {upcomingMeetings.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Sin citas próximas</p>
              ) : upcomingMeetings.map((meeting) => (
                <div key={meeting.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">{format(new Date(meeting.start_at), 'MMM', { locale: es })}</p>
                    <p className="text-lg font-bold text-foreground">{format(new Date(meeting.start_at), 'd')}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{meeting.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(meeting.start_at), 'HH:mm')}
                      {meeting.contact_name && ` - ${meeting.contact_name}`}
                    </p>
                    <Badge variant="outline" className="mt-1 text-xs">{meeting.meeting_type || 'meeting'}</Badge>
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
              {pendingTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Sin tareas pendientes</p>
              ) : pendingTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className={`h-2 w-2 rounded-full shrink-0 ${
                    task.priority === 'urgent' ? 'bg-destructive' :
                    task.priority === 'high' ? 'bg-warning' :
                    task.priority === 'medium' ? 'bg-primary' : 'bg-muted-foreground'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                    <p className="text-xs text-muted-foreground">{task.due_date || 'Sin fecha'} {task.due_time && `· ${task.due_time}`}</p>
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
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Sin actividad reciente</p>
              ) : recentActivity.map((activity) => (
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
            {activeDeals.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin deals activos</p>
            ) : (
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
                    {activeDeals.map((deal) => (
                      <tr key={deal.id} className="border-b last:border-0">
                        <td className="py-3 font-medium text-foreground">{deal.title}</td>
                        <td className="py-3 text-muted-foreground">{deal.contact_name || '-'}</td>
                        <td className="py-3">
                          {deal.stage_name ? (
                            <Badge variant="outline" className="text-xs" style={{ borderColor: deal.stage_color || undefined, color: deal.stage_color || undefined }}>
                              {deal.stage_name}
                            </Badge>
                          ) : '-'}
                        </td>
                        <td className="py-3 text-right font-medium text-foreground">${Number(deal.value).toLocaleString()} {deal.currency}</td>
                        <td className="py-3 text-muted-foreground">{deal.expected_close_date || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </AppLayout>
  );
}
