import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState, useCallback } from "react";
import {
  DollarSign, Trophy, XCircle, ArrowUpRight, ArrowDownRight,
  CalendarDays, CheckSquare, Activity, Target, BarChart3, Loader2,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { usePermissions } from "@/hooks/usePermissions";

/* ─── Types ──────────────────────────────────────────────────────────────── */
type Period = "week" | "month" | "quarter" | "year";

const PERIOD_OPTIONS: { value: Period; label: string; days: number }[] = [
  { value: "week",    label: "7 días",    days: 7   },
  { value: "month",   label: "30 días",   days: 30  },
  { value: "quarter", label: "Trimestre", days: 90  },
  { value: "year",    label: "Este año",  days: 365 },
];

interface StageRow {
  id: string; name: string; position: number; color: string | null;
  count: number; value: number;
}
interface MeetingRow {
  id: string; title: string; start_at: string;
  meeting_type: string | null; contact_name: string | null;
}
interface TaskRow {
  id: string; title: string; priority: string;
  task_type: string; due_date: string | null; due_time: string | null;
}
interface ActivityRow { id: string; event_type: string; summary: string; created_at: string; }
interface RatioRow    { label: string; count: number; }

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const eventIcons: Record<string, string> = {
  call: "📞", whatsapp: "💬", email: "✉️", meeting: "📅",
  stage_change: "🔄", note: "📝", deal_created: "🤝", system: "⚙️", task_created: "✅",
};

function normObj(raw: string) {
  return raw.toLowerCase().replace(/[.,;:!?¿¡"'`]+/g, " ").replace(/\s+/g, " ").trim();
}

function fmt(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)     return `${(value / 1_000).toFixed(0)}K`;
  return value.toLocaleString();
}

function trendPct(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */
function PeriodSelector({
  value, onChange,
}: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-muted/50 p-1">
      {PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            value === opt.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function KpiCard({
  label, value, subValue, trend, trendIsPoints = false, invertTrend = false, icon, accent,
}: {
  label: string; value: string | number; subValue?: string;
  trend?: number | null; trendIsPoints?: boolean; invertTrend?: boolean;
  icon: React.ReactNode;
  accent: "emerald" | "blue" | "orange" | "red" | "violet";
}) {
  const accentMap: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-400",
    blue:    "bg-blue-50 text-blue-600 dark:bg-blue-900/25 dark:text-blue-400",
    orange:  "bg-orange-50 text-orange-600 dark:bg-orange-900/25 dark:text-orange-400",
    red:     "bg-red-50 text-red-600 dark:bg-red-900/25 dark:text-red-400",
    violet:  "bg-violet-50 text-violet-600 dark:bg-violet-900/25 dark:text-violet-400",
  };

  const trendUp   = trend !== null && trend !== undefined && trend !== 0 && (invertTrend ? trend < 0 : trend > 0);
  const trendDown = trend !== null && trend !== undefined && trend !== 0 && (invertTrend ? trend > 0 : trend < 0);

  return (
    <Card className="border-none shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${accentMap[accent]}`}>
            {icon}
          </div>
          {trend !== null && trend !== undefined && trend !== 0 && (
            <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              trendUp
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                : trendDown
                  ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                  : ""
            }`}>
              {trendUp   && <ArrowUpRight   className="h-3 w-3" />}
              {trendDown && <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(trend)}{trendIsPoints ? " pp" : "%"}
            </span>
          )}
        </div>
        <p className="text-2xl font-bold text-foreground tabular-nums leading-none">
          {value}
        </p>
        {subValue && (
          <p className="text-xs text-muted-foreground mt-1">{subValue}</p>
        )}
        <p className="text-xs font-medium text-muted-foreground mt-3">{label}</p>
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon, text, sub }: { icon: React.ReactNode; text: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <div className="text-muted-foreground/25 mb-2">{icon}</div>
      <p className="text-sm text-muted-foreground">{text}</p>
      {sub && <p className="text-xs text-muted-foreground/60 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const { isVendor, myUserId } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("month");

  // KPIs — current period
  const [wonValue,     setWonValue]     = useState(0);
  const [wonCurrency,  setWonCurrency]  = useState("USD");
  const [wonCount,     setWonCount]     = useState(0);
  const [lostCount,    setLostCount]    = useState(0);
  const [pipelineVal,  setPipelineVal]  = useState(0);
  const [pipelineCur,  setPipelineCur]  = useState("USD");
  const [pipelineN,    setPipelineN]    = useState(0);
  const [avgDeal,      setAvgDeal]      = useState(0);

  // KPIs — previous period (for trends)
  const [prevWonVal,  setPrevWonVal]  = useState(0);
  const [prevWonN,    setPrevWonN]    = useState(0);
  const [prevLostN,   setPrevLostN]   = useState(0);

  // Pipeline funnel
  const [stageData, setStageData] = useState<StageRow[]>([]);

  // Ratio widgets
  const [lostReasons,   setLostReasons]   = useState<RatioRow[]>([]);
  const [topObjections, setTopObjections] = useState<RatioRow[]>([]);

  // Activity widgets
  const [upcomingMeetings, setUpcomingMeetings] = useState<MeetingRow[]>([]);
  const [pendingTasks,     setPendingTasks]     = useState<TaskRow[]>([]);
  const [recentActivity,   setRecentActivity]   = useState<ActivityRow[]>([]);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    const vf = isVendor && myUserId ? myUserId : null;

    const days      = PERIOD_OPTIONS.find((x) => x.value === period)!.days;
    const now       = new Date();
    const startDate = new Date(now.getTime() - days * 86_400_000);
    const prevStart = new Date(startDate.getTime() - days * 86_400_000);
    const startIso  = startDate.toISOString();
    const prevIso   = prevStart.toISOString();

    /* ---------- build queries ---------- */
    // Current-period deal contacts (won + lost within period)
    let curQ = supabase
      .from("contacts")
      .select("id, lead_status, budget, budget_currency, stage_id")
      .not("pipeline_id", "is", null)
      .gte("created_at", startIso);
    if (vf) curQ = curQ.eq("owner_id", vf);

    // Previous-period deal contacts
    let prevQ = supabase
      .from("contacts")
      .select("id, lead_status, budget, budget_currency")
      .not("pipeline_id", "is", null)
      .gte("created_at", prevIso)
      .lt("created_at", startIso);
    if (vf) prevQ = prevQ.eq("owner_id", vf);

    // All active pipeline contacts (current state — not period-filtered)
    let activeQ = supabase
      .from("contacts")
      .select("id, budget, budget_currency, stage_id")
      .not("pipeline_id", "is", null)
      .eq("lead_status", "active");
    if (vf) activeQ = activeQ.eq("owner_id", vf);

    // Pipeline stages
    const stagesQ = supabase
      .from("pipeline_stages")
      .select("id, name, position, color")
      .order("position");

    // Lost reasons (all time)
    let lostQ = supabase
      .from("contacts")
      .select("lost_reason")
      .eq("lead_status", "lost")
      .not("lost_reason", "is", null);
    if (vf) lostQ = lostQ.eq("owner_id", vf);

    // Upcoming meetings
    let meetQ = supabase
      .from("meetings")
      .select("id, title, start_at, meeting_type, contacts(full_name)")
      .eq("status", "scheduled")
      .gte("start_at", now.toISOString())
      .order("start_at")
      .limit(4);
    if (vf) meetQ = meetQ.eq("advisor_id", vf);

    // Pending tasks
    let taskQ = supabase
      .from("tasks")
      .select("id, title, priority, task_type, due_date, due_time")
      .eq("status", "pending")
      .order("due_date")
      .limit(5);
    if (vf) taskQ = taskQ.eq("owner_id", vf);

    // Recent activity
    let actQ = supabase
      .from("activities")
      .select("id, event_type, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(8);
    if (vf) actQ = actQ.eq("created_by", vf);

    // AI objections
    const objQ = supabase
      .from("contact_ai_analyses")
      .select("objections")
      .not("objections", "is", null);

    const [
      curRes, prevRes, activeRes, stagesRes,
      lostRes, meetRes, taskRes, actRes, objRes,
    ] = await Promise.all([
      curQ, prevQ, activeQ, stagesQ,
      lostQ, meetQ, taskQ, actQ, objQ,
    ]);

    /* ---------- KPI calculations ---------- */
    const cur    = (curRes.data  || []) as any[];
    const prev   = (prevRes.data || []) as any[];
    const active = (activeRes.data || []) as any[];

    const wonCur  = cur.filter((d) => d.lead_status === "won");
    const lostCur = cur.filter((d) => d.lead_status === "lost");
    const wv  = wonCur.reduce((s: number, d: any) => s + Number(d.budget || 0), 0);
    const wc  = wonCur[0]?.budget_currency || "USD";
    setWonValue(wv);
    setWonCurrency(wc);
    setWonCount(wonCur.length);
    setLostCount(lostCur.length);
    setAvgDeal(wonCur.length > 0 ? Math.round(wv / wonCur.length) : 0);

    const wonPrev  = prev.filter((d: any) => d.lead_status === "won");
    const lostPrev = prev.filter((d: any) => d.lead_status === "lost");
    setPrevWonVal(wonPrev.reduce((s: number, d: any) => s + Number(d.budget || 0), 0));
    setPrevWonN(wonPrev.length);
    setPrevLostN(lostPrev.length);

    const pv = active.reduce((s: number, d: any) => s + Number(d.budget || 0), 0);
    const pc = active[0]?.budget_currency || "USD";
    setPipelineVal(pv);
    setPipelineCur(pc);
    setPipelineN(active.length);

    /* ---------- Funnel ---------- */
    const stages = (stagesRes.data || []) as any[];
    const sMap = new Map<string, { count: number; value: number }>();
    for (const c of active) {
      if (!c.stage_id) continue;
      const p = sMap.get(c.stage_id) || { count: 0, value: 0 };
      sMap.set(c.stage_id, { count: p.count + 1, value: p.value + Number(c.budget || 0) });
    }
    setStageData(
      stages.map((s: any) => ({
        id: s.id, name: s.name, position: s.position, color: s.color,
        ...(sMap.get(s.id) || { count: 0, value: 0 }),
      }))
    );

    /* ---------- Lost reasons ---------- */
    const rMap = new Map<string, number>();
    for (const row of (lostRes.data || []) as any[])
      if (row.lost_reason) rMap.set(row.lost_reason, (rMap.get(row.lost_reason) || 0) + 1);
    setLostReasons([...rMap.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count })));

    /* ---------- Objections ---------- */
    const oMap = new Map<string, number>();
    (objRes.data || []).forEach((row: any) => {
      const arr = Array.isArray(row.objections) ? row.objections : [];
      arr.forEach((item: unknown) => {
        if (typeof item !== "string") return;
        const n = normObj(item);
        if (!n) return;
        oMap.set(n, (oMap.get(n) || 0) + 1);
      });
    });
    setTopObjections(
      [...oMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([label, count]) => ({
          label: label.charAt(0).toUpperCase() + label.slice(1),
          count,
        }))
    );

    /* ---------- Activity widgets ---------- */
    setUpcomingMeetings(
      (meetRes.data || []).map((m: any) => ({
        id: m.id, title: m.title, start_at: m.start_at,
        meeting_type: m.meeting_type, contact_name: m.contacts?.full_name || null,
      }))
    );
    setPendingTasks((taskRes.data || []) as TaskRow[]);
    setRecentActivity((actRes.data || []) as ActivityRow[]);

    setLoading(false);
  }, [isVendor, myUserId, period]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  /* ─── Derived metrics ──────────────────────────────────────────── */
  const winRate = wonCount + lostCount > 0
    ? Math.round((wonCount / (wonCount + lostCount)) * 100)
    : null;

  const prevWinRate = prevWonN + prevLostN > 0
    ? Math.round((prevWonN / (prevWonN + prevLostN)) * 100)
    : null;

  const winRateDelta =
    winRate !== null && prevWinRate !== null ? winRate - prevWinRate : null;

  const maxStageCount = Math.max(...stageData.map((s) => s.count), 1);

  /* ─── Render ────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <AppLayout>
        <AppHeader
          title="Dashboard"
          subtitle={format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })}
        />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </main>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AppHeader
        title="Dashboard"
        subtitle={format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })}
      />
      <main className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">

        {/* ── Header bar ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground font-medium">Resumen de rendimiento</p>
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>

        {/* ── 5 KPI cards ────────────────────────────────────────── */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
          <KpiCard
            label="Revenue ganado"
            value={wonValue > 0 ? `${fmt(wonValue)} ${wonCurrency}` : "—"}
            subValue={`${wonCount} ${wonCount === 1 ? "deal cerrado" : "deals cerrados"}`}
            trend={trendPct(wonValue, prevWonVal)}
            icon={<DollarSign className="h-4 w-4" />}
            accent="emerald"
          />
          <KpiCard
            label="Pipeline activo"
            value={pipelineVal > 0 ? `${fmt(pipelineVal)} ${pipelineCur}` : "—"}
            subValue={`${pipelineN} ${pipelineN === 1 ? "deal en curso" : "deals en curso"}`}
            icon={<BarChart3 className="h-4 w-4" />}
            accent="blue"
          />
          <KpiCard
            label="Win Rate"
            value={winRate !== null ? `${winRate}%` : "—"}
            subValue={
              winRate !== null
                ? `${wonCount} ganados · ${lostCount} perdidos`
                : "Sin datos en el período"
            }
            trend={winRateDelta}
            trendIsPoints
            icon={<Trophy className="h-4 w-4" />}
            accent="orange"
          />
          <KpiCard
            label="Deals perdidos"
            value={lostCount}
            subValue="En el período"
            trend={trendPct(lostCount, prevLostN)}
            invertTrend
            icon={<XCircle className="h-4 w-4" />}
            accent="red"
          />
          <KpiCard
            label="Deal promedio"
            value={avgDeal > 0 ? `${fmt(avgDeal)} ${wonCurrency}` : "—"}
            subValue="Por deal ganado"
            icon={<Target className="h-4 w-4" />}
            accent="violet"
          />
        </div>

        {/* ── Pipeline funnel + Loss reasons ─────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-3">

          {/* Funnel — takes 2/3 */}
          <Card className="border-none shadow-sm lg:col-span-2">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Pipeline por etapa
                </CardTitle>
                <span className="text-xs text-muted-foreground">
                  {pipelineN} {pipelineN === 1 ? "deal activo" : "deals activos"}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {stageData.filter((s) => s.count > 0).length === 0 ? (
                <EmptyState
                  icon={<BarChart3 className="h-10 w-10" />}
                  text="Sin deals activos en el pipeline"
                  sub="Mueve leads al pipeline para ver el embudo"
                />
              ) : (
                <div className="space-y-4">
                  {stageData.map((stage, idx) => {
                    const barPct = Math.round((stage.count / maxStageCount) * 100);
                    const nextStage = stageData[idx + 1];
                    const convRate =
                      nextStage && stage.count > 0 && nextStage.count > 0
                        ? Math.round((nextStage.count / stage.count) * 100)
                        : null;

                    return (
                      <div key={stage.id}>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-medium text-foreground w-44 truncate">
                            {stage.name}
                          </span>
                          <div className="flex items-center gap-4 text-muted-foreground">
                            {stage.value > 0 && (
                              <span className="tabular-nums hidden sm:block">
                                {fmt(stage.value)} {pipelineCur}
                              </span>
                            )}
                            <span
                              className={`tabular-nums font-semibold w-16 text-right ${
                                stage.count > 0 ? "text-foreground" : "text-muted-foreground/50"
                              }`}
                            >
                              {stage.count} {stage.count === 1 ? "lead" : "leads"}
                            </span>
                          </div>
                        </div>
                        <div className="h-7 w-full rounded-md bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-md transition-all duration-500"
                            style={{
                              width: `${Math.max(barPct, stage.count > 0 ? 3 : 0)}%`,
                              backgroundColor: stage.color ?? "hsl(24 95% 53%)",
                              opacity: stage.count === 0 ? 0.15 : 0.8,
                            }}
                          />
                        </div>
                        {convRate !== null && (
                          <p className="text-[10px] text-muted-foreground mt-1 pl-1">
                            → {convRate}% avanzan a <span className="font-medium">{nextStage.name}</span>
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Lost reasons — takes 1/3 */}
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  Razones de pérdida
                </CardTitle>
                {lostReasons.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {lostReasons.reduce((s, r) => s + r.count, 0)} total
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {lostReasons.length === 0 ? (
                <EmptyState
                  icon={<XCircle className="h-10 w-10" />}
                  text="Sin razones registradas"
                  sub='Aparecen al mover deals a "Cerrado perdido"'
                />
              ) : (
                <div className="space-y-3">
                  {lostReasons.map((r) => {
                    const pct = Math.round((r.count / lostReasons[0].count) * 100);
                    return (
                      <div key={r.label}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium text-foreground truncate pr-2">{r.label}</span>
                          <span className="text-muted-foreground shrink-0 tabular-nums">{r.count}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-destructive/65 transition-all duration-500"
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
        </div>

        {/* ── Activity row ───────────────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-3">

          {/* Upcoming meetings */}
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                Próximas citas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcomingMeetings.length === 0 ? (
                <EmptyState
                  icon={<CalendarDays className="h-8 w-8" />}
                  text="Sin citas próximas"
                  sub="Agenda una desde un lead"
                />
              ) : (
                upcomingMeetings.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="text-center w-8 shrink-0">
                      <p className="text-[10px] text-muted-foreground uppercase leading-none">
                        {format(new Date(m.start_at), "MMM", { locale: es })}
                      </p>
                      <p className="text-base font-bold text-foreground leading-tight">
                        {format(new Date(m.start_at), "d")}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{m.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(m.start_at), "HH:mm")}
                        {m.contact_name && ` · ${m.contact_name}`}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {m.meeting_type || "cita"}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Pending tasks */}
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-primary" />
                Tareas pendientes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pendingTasks.length === 0 ? (
                <EmptyState
                  icon={<CheckSquare className="h-8 w-8" />}
                  text="¡Todo al día!"
                  sub="Sin tareas pendientes"
                />
              ) : (
                pendingTasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <div
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        t.priority === "urgent"
                          ? "bg-destructive"
                          : t.priority === "high"
                          ? "bg-orange-400"
                          : t.priority === "medium"
                          ? "bg-primary"
                          : "bg-muted-foreground/40"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{t.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.due_date || "Sin fecha"}
                        {t.due_time ? ` · ${t.due_time}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {t.task_type}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Recent activity */}
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Actividad reciente
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {recentActivity.length === 0 ? (
                <EmptyState
                  icon={<Activity className="h-8 w-8" />}
                  text="Sin actividad reciente"
                  sub="Cuando llegue un lead aparece aquí"
                />
              ) : (
                recentActivity.map((a) => (
                  <div key={a.id} className="flex items-start gap-2.5 py-2.5">
                    <span className="text-sm shrink-0 mt-0.5">{eventIcons[a.event_type] || "📋"}</span>
                    <div className="min-w-0">
                      <p className="text-xs text-foreground leading-snug">{a.summary}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {format(new Date(a.created_at), "d MMM, HH:mm", { locale: es })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Objections (only if data exists) ───────────────────── */}
        {topObjections.length > 0 && (
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Objeciones principales
                </CardTitle>
                <span className="text-xs text-muted-foreground">
                  {topObjections.reduce((s, o) => s + o.count, 0)} detectadas
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {topObjections.map((obj) => {
                  const pct = Math.round((obj.count / topObjections[0].count) * 100);
                  return (
                    <div key={obj.label}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium truncate pr-2">{obj.label}</span>
                        <span className="text-muted-foreground shrink-0 tabular-nums">{obj.count}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amber-400/70 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

      </main>
    </AppLayout>
  );
}
