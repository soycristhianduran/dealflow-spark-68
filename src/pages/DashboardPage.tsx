import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkline, dailyCounts, trendPct } from "@/components/ui/sparkline";
import { HeroCard } from "@/components/dashboard/HeroCard";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState, useCallback } from "react";
import {
  Users, Handshake, Trophy, XCircle, DollarSign,
  CalendarDays, CalendarCheck, CheckSquare,
  TrendingUp, ArrowUpRight, ArrowDownRight, UserPlus, Star, Loader2,
  AlertTriangle
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { usePermissions } from "@/hooks/usePermissions";

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

interface ObjectionRow {
  label: string;
  count: number;
}

/**
 * Normalize an objection string so semantically equivalent items collapse
 * into a single bucket: trim, lowercase, strip punctuation/extra whitespace.
 */
function normalizeObjection(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,;:!?¿¡"'`]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Title-case the first letter for display, leave the rest as the user wrote it
 * (e.g. "precio muy alto" -> "Precio muy alto").
 */
function prettyObjection(normalized: string): string {
  if (!normalized) return normalized;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

const eventTypeIcons: Record<string, string> = {
  call: '📞', whatsapp: '💬', email: '✉️', meeting: '📅',
  stage_change: '🔄', note: '📝', deal_created: '🤝', system: '⚙️', task_created: '✅'
};

export default function DashboardPage() {
  const { isVendor, myUserId } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    contactsTotal: 0, contactsNew: 0, contactsQualified: 0,
    dealsOpen: 0, dealsWon: 0, dealsLost: 0,
    pipelineValue: 0, pipelineCurrency: 'USD',
    wonValue: 0, wonCurrency: 'USD',
    meetingsScheduled: 0, meetingsCompleted: 0, tasksPending: 0,
  });
  const [upcomingMeetings, setUpcomingMeetings] = useState<MeetingRow[]>([]);
  const [pendingTasks, setPendingTasks] = useState<TaskRow[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityRow[]>([]);
  const [activeDeals, setActiveDeals] = useState<DealRow[]>([]);
  const [topObjections, setTopObjections] = useState<ObjectionRow[]>([]);
  const [objectionsAnalyzed, setObjectionsAnalyzed] = useState(0);
  // 7-day time series for the sparklines on KPI cards.
  // Keys come from fetched created_at timestamps so the sparkline reflects
  // real activity, not random data.
  const [sparkData, setSparkData] = useState<{
    contacts: number[];
    deals: number[];
    meetings: number[];
    tasks: number[];
  }>({ contacts: [], deals: [], meetings: [], tasks: [] });

  const fetchDashboard = useCallback(async () => {
    setLoading(true);

    // For vendor role: scope all queries to their own records only
    const vendorFilter = isVendor && myUserId ? myUserId : null;

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
      (() => {
        let q = supabase.from("contacts").select("id, status, created_at");
        if (vendorFilter) q = q.eq("owner_id", vendorFilter);
        return q;
      })(),
      (() => {
        let q = supabase.from("contacts").select("id, lead_status, budget, budget_currency, created_at").not("pipeline_id", "is", null);
        if (vendorFilter) q = q.eq("owner_id", vendorFilter);
        return q;
      })(),
      (() => {
        let q = supabase.from("meetings").select("id, status, created_at");
        if (vendorFilter) q = q.eq("advisor_id", vendorFilter);
        return q;
      })(),
      (() => {
        let q = supabase.from("tasks").select("id, status, created_at");
        if (vendorFilter) q = q.eq("owner_id", vendorFilter);
        return q;
      })(),
      (() => {
        let q = supabase.from("activities").select("id, event_type, summary, created_at").order("created_at", { ascending: false }).limit(6);
        if (vendorFilter) q = q.eq("created_by", vendorFilter);
        return q;
      })(),
      (() => {
        let q = supabase.from("meetings").select("id, title, start_at, meeting_type, contacts(full_name)")
          .eq("status", "scheduled").gte("start_at", new Date().toISOString()).order("start_at").limit(3);
        if (vendorFilter) q = q.eq("advisor_id", vendorFilter);
        return q;
      })(),
      (() => {
        let q = supabase.from("tasks").select("id, title, priority, task_type, due_date, due_time")
          .eq("status", "pending").order("due_date").limit(4);
        if (vendorFilter) q = q.eq("owner_id", vendorFilter);
        return q;
      })(),
      (() => {
        let q = supabase.from("contacts").select("id, full_name, budget, budget_currency, lead_status, expected_close_date, pipeline_stages(name, color)")
          .not("pipeline_id", "is", null).eq("lead_status", "active").order("created_at", { ascending: false }).limit(10);
        if (vendorFilter) q = q.eq("owner_id", vendorFilter);
        return q;
      })(),
    ]);

    // Top objections: fetch all AI analyses with non-empty objections.
    // RLS already filters by user_id. We aggregate client-side because the
    // dataset per workspace is small (one row per contact) and we avoid a
    // dedicated SQL function / migration.
    const objectionsRes = await supabase
      .from("contact_ai_analyses")
      .select("objections")
      .not("objections", "is", null);

    const counts = new Map<string, number>();
    let analyzedCount = 0;
    (objectionsRes.data || []).forEach((row: any) => {
      const arr = Array.isArray(row.objections) ? row.objections : [];
      if (arr.length === 0) return;
      analyzedCount += 1;
      arr.forEach((item: unknown) => {
        if (typeof item !== "string") return;
        const norm = normalizeObjection(item);
        if (!norm) return;
        counts.set(norm, (counts.get(norm) || 0) + 1);
      });
    });
    const top = Array.from(counts.entries())
      .map(([label, count]) => ({ label: prettyObjection(label), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
    setTopObjections(top);
    setObjectionsAnalyzed(analyzedCount);

    const contacts = contactsRes.data || [];
    const pipelineContacts = dealsRes.data || [];
    const meetings = meetingsRes.data || [];
    const tasks = tasksRes.data || [];

    const activeLeads = pipelineContacts.filter((d: any) => d.lead_status === "active");
    const wonLeads = pipelineContacts.filter((d: any) => d.lead_status === "won");
    const pipelineValue = activeLeads.reduce((sum: number, d: any) => sum + Number(d.budget || 0), 0);
    const mainCurrency = activeLeads.length > 0 ? activeLeads[0].budget_currency : (pipelineContacts.length > 0 ? pipelineContacts[0].budget_currency : "USD");
    const wonValue = wonLeads.reduce((sum: number, d: any) => sum + Number(d.budget || 0), 0);
    const wonCurrency = wonLeads.length > 0 ? wonLeads[0].budget_currency : mainCurrency;

    // Build 7-day sparkline series from real created_at timestamps
    setSparkData({
      contacts: dailyCounts(contacts.map((c: any) => c.created_at).filter(Boolean), 7),
      deals: dailyCounts(pipelineContacts.map((d: any) => d.created_at).filter(Boolean), 7),
      meetings: dailyCounts(meetings.map((m: any) => m.created_at).filter(Boolean), 7),
      tasks: dailyCounts(tasks.map((t: any) => t.created_at).filter(Boolean), 7),
    });

    setStats({
      contactsTotal: contacts.length,
      contactsNew: contacts.filter((c: any) => c.status === "new").length,
      contactsQualified: contacts.filter((c: any) => c.status === "qualified").length,
      dealsOpen: activeLeads.length,
      dealsWon: wonLeads.length,
      dealsLost: pipelineContacts.filter((d: any) => d.lead_status === "lost").length,
      pipelineValue,
      pipelineCurrency: mainCurrency || "USD",
      wonValue,
      wonCurrency: wonCurrency || "USD",
      meetingsScheduled: meetings.filter((m: any) => m.status === "scheduled").length,
      meetingsCompleted: meetings.filter((m: any) => m.status === "completed").length,
      tasksPending: tasks.filter((t: any) => t.status === "pending").length,
    });

    setRecentActivity((activitiesRes.data || []) as ActivityRow[]);

    setUpcomingMeetings((upcomingRes.data || []).map((m: any) => ({
      id: m.id, title: m.title, start_at: m.start_at, meeting_type: m.meeting_type,
      contact_name: m.contacts?.full_name || null,
    })));

    setPendingTasks((pendingTasksRes.data || []) as TaskRow[]);

    setActiveDeals((activeDealsRes.data || []).map((d: any) => ({
      id: d.id, title: d.full_name, value: d.budget, currency: d.budget_currency,
      status: d.lead_status,
      expected_close_date: d.expected_close_date,
      contact_name: null,
      stage_name: d.pipeline_stages?.name || null,
      stage_color: d.pipeline_stages?.color || null,
    })));

    setLoading(false);
  }, [isVendor, myUserId]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const formatValue = (value: number, currency: string) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M ${currency}`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K ${currency}`;
    return `${value.toLocaleString()} ${currency}`;
  };

  // KPI cards. `spark` (optional) is a 7-day series → drives a tiny chart
  // and a trend pill on each card.
  const statCards: Array<{
    label: string;
    value: string | number;
    icon: any;
    spark?: number[];
  }> = [
    { label: "Leads", value: stats.contactsTotal, icon: Users, spark: sparkData.contacts },
    { label: "Nuevos", value: stats.contactsNew, icon: UserPlus },
    { label: "Calificados", value: stats.contactsQualified, icon: Star },
    { label: "Leads activos", value: stats.dealsOpen, icon: Handshake, spark: sparkData.deals },
    { label: "Leads ganados", value: stats.dealsWon, icon: Trophy },
    { label: "Leads perdidos", value: stats.dealsLost, icon: XCircle },
    { label: "Valor pipeline", value: formatValue(stats.pipelineValue, stats.pipelineCurrency), icon: DollarSign, spark: sparkData.deals },
    { label: "Valor ganado", value: formatValue(stats.wonValue, stats.wonCurrency), icon: Trophy },
    { label: "Citas agendadas", value: stats.meetingsScheduled, icon: CalendarDays, spark: sparkData.meetings },
    { label: "Citas realizadas", value: stats.meetingsCompleted, icon: CalendarCheck },
    { label: "Tareas pendientes", value: stats.tasksPending, icon: CheckSquare, spark: sparkData.tasks },
    {
      label: "Objeciones detectadas",
      value: topObjections.reduce((sum, o) => sum + o.count, 0),
      icon: AlertTriangle,
    },
  ];

  // New leads created this week — drives the contextual HeroCard CTA
  const newLeadsThisWeek = sparkData.contacts.reduce((a, b) => a + b, 0);

  const maxObjectionCount = topObjections[0]?.count || 0;

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
        {/* Hero — personalized greeting + sunset gradient + contextual CTA */}
        <HeroCard
          pipelineValue={stats.pipelineValue}
          pipelineCurrency={stats.pipelineCurrency}
          dealsOpen={stats.dealsOpen}
          tasksPending={stats.tasksPending}
          newLeadsThisWeek={newLeadsThisWeek}
        />

        {/* KPI grid with sparklines + trends */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 stagger">
          {statCards.map((stat) => {
            const trend = stat.spark ? trendPct(stat.spark) : null;
            const trendUp = trend !== null && trend > 0;
            const trendDown = trend !== null && trend < 0;
            return (
              <Card
                key={stat.label}
                className="border-none shadow-sm hover:shadow-md transition-shadow group"
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary group-hover:scale-105 transition-transform">
                        <stat.icon className="h-4 w-4" />
                      </div>
                      <p className="text-xs font-medium text-muted-foreground truncate">{stat.label}</p>
                    </div>
                    {trend !== null && trend !== 0 && (
                      <span
                        className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                          trendUp
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                            : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                        }`}
                      >
                        {trendUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {Math.abs(trend)}%
                      </span>
                    )}
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <p className="text-2xl font-bold text-foreground tabular-nums leading-none">
                      {stat.value}
                    </p>
                    {stat.spark && stat.spark.some((v) => v > 0) && (
                      <Sparkline
                        data={stat.spark}
                        color={trendDown ? "hsl(0 84% 60%)" : "hsl(24 95% 53%)"}
                        width={70}
                        height={26}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <CalendarDays className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">Sin citas próximas</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">Agenda una desde un lead</p>
                </div>
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
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <CheckSquare className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">¡Todo al día!</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">Sin tareas pendientes</p>
                </div>
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
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <TrendingUp className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">Sin actividad reciente</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">Cuando llegue un lead aparece aquí</p>
                </div>
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
              <AlertTriangle className="h-4 w-4 text-warning" />
              Objeciones principales
              {objectionsAnalyzed > 0 && (
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  · {objectionsAnalyzed} {objectionsAnalyzed === 1 ? 'lead analizado' : 'leads analizados'}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topObjections.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Aún no hay objeciones detectadas. Cuando la IA analice tus
                conversaciones, las objeciones más frecuentes aparecerán aquí.
              </p>
            ) : (
              <div className="space-y-3">
                {topObjections.map((obj) => {
                  const pct = maxObjectionCount > 0
                    ? Math.round((obj.count / maxObjectionCount) * 100)
                    : 0;
                  return (
                    <div key={obj.label} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground truncate pr-3">
                          {obj.label}
                        </span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {obj.count} {obj.count === 1 ? 'lead' : 'leads'}
                        </Badge>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-warning transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Handshake className="h-4 w-4 text-primary" />
              Deals recientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeDeals.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin deals</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium text-muted-foreground">Deal</th>
                      <th className="pb-2 font-medium text-muted-foreground">Contacto</th>
                      <th className="pb-2 font-medium text-muted-foreground">Etapa</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Valor</th>
                      <th className="pb-2 font-medium text-muted-foreground">Estado</th>
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
                        <td className="py-3">
                          <Badge variant={deal.status === 'won' ? 'default' : deal.status === 'lost' ? 'destructive' : 'outline'} className="text-xs">
                            {deal.status === 'open' ? 'Abierto' : deal.status === 'won' ? 'Ganado' : 'Perdido'}
                          </Badge>
                        </td>
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
