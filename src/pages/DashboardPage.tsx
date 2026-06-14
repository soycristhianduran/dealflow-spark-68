import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  DollarSign, Trophy, XCircle, ArrowUpRight, ArrowDownRight,
  CalendarDays, CheckSquare, Activity, Target, BarChart3, Loader2,
  AlertTriangle, MessageCircle, Users, GitBranch, X, CheckCircle2,
  Zap, Mail, Sparkles, Sliders, Eye, EyeOff, ChevronUp, ChevronDown,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { usePermissions } from "@/hooks/usePermissions";
import { DashboardInsights } from "@/components/dashboard/DashboardInsights";
import { useOrganizationContext } from "@/context/OrganizationContext";

/* ─── Types ──────────────────────────────────────────────────────────────── */
type Period = "week" | "month" | "quarter" | "year";

// Dashboard sections the user can show/hide and reorder.
const DASH_BLOCKS: { id: string; label: string }[] = [
  { id: "kpis",       label: "Indicadores de ventas (KPIs)" },
  { id: "insights",   label: "Adquisición, Agente IA, Campañas y Conversión" },
  { id: "funnel",     label: "Pipeline por etapa + Razones de pérdida" },
  { id: "agenda",     label: "Citas, Tareas y Actividad reciente" },
  { id: "objections", label: "Objeciones principales (IA)" },
];
const DASH_DEFAULT_ORDER = DASH_BLOCKS.map(b => b.id);

const PERIOD_OPTIONS: { value: Period; label: string; days: number }[] = [
  { value: "week",    label: "7 días",    days: 7   },
  { value: "month",   label: "30 días",   days: 30  },
  { value: "quarter", label: "Trimestre", days: 90  },
  { value: "year",    label: "Este año",  days: 365 },
];

/** Partial contact row used for KPI calculations */
interface KpiContactRow {
  id: string;
  lead_status: string | null;
  budget: number | null;
  budget_currency: string;
  stage_id?: string | null;
}

/** Pipeline stage row with aggregated counts */
interface StageRow {
  id: string; name: string; position: number; color: string | null;
  count: number; value: number;
}

/** Pipeline stage from DB select */
interface StageDbRow {
  id: string; name: string; position: number; color: string | null;
}

/** Lost reason row */
interface LostReasonRow { lost_reason: string | null; }

/** Objection row */
interface ObjectionRow { objections: unknown; }
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
          className={`px-2.5 py-2 min-h-[36px] text-xs font-medium rounded-md transition-all ${
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

function Donut({ value, light }: { value: number; light?: boolean }) {
  const size = 46, stroke = 5, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));
  const off = c * (1 - pct / 100);
  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
        className={light ? "stroke-white/20" : "stroke-muted"} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
        className={light ? "stroke-white" : "stroke-orange-500"}
        strokeDasharray={c} strokeDashoffset={off} style={{ transition: "stroke-dashoffset .6s ease" }} />
    </svg>
  );
}

function KpiCard({
  label, value, subValue, trend, trendIsPoints = false, invertTrend = false, icon, accent, highlight = false, gauge = null,
}: {
  label: string; value: string | number; subValue?: string;
  trend?: number | null; trendIsPoints?: boolean; invertTrend?: boolean;
  icon: React.ReactNode;
  accent: "emerald" | "blue" | "orange" | "red" | "violet";
  highlight?: boolean; gauge?: number | null;
}) {
  const accentMap: Record<string, { chip: string; glow: string }> = {
    emerald: { chip: "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-emerald-500/25", glow: "from-emerald-500/10" },
    blue:    { chip: "bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-blue-500/25",          glow: "from-blue-500/10" },
    orange:  { chip: "bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-orange-500/25",    glow: "from-orange-500/10" },
    red:     { chip: "bg-gradient-to-br from-red-400 to-red-600 text-white shadow-red-500/25",             glow: "from-red-500/10" },
    violet:  { chip: "bg-gradient-to-br from-violet-400 to-violet-600 text-white shadow-violet-500/25",    glow: "from-violet-500/10" },
  };
  const a = accentMap[accent];

  const trendUp   = trend !== null && trend !== undefined && trend !== 0 && (invertTrend ? trend < 0 : trend > 0);
  const trendDown = trend !== null && trend !== undefined && trend !== 0 && (invertTrend ? trend > 0 : trend < 0);

  if (highlight) {
    return (
      <div className="group relative overflow-hidden rounded-2xl p-4 shadow-lg shadow-indigo-500/20 bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-600 text-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-500/30">
        <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/15 blur-2xl" />
        <div className="pointer-events-none absolute -left-6 -bottom-10 h-28 w-28 rounded-full bg-black/10 blur-2xl" />
        <div className="relative flex items-start justify-between mb-3.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm text-white">{icon}</div>
          {gauge !== null && gauge !== undefined && <Donut value={gauge} light />}
        </div>
        <p className="relative text-[28px] font-bold tabular-nums leading-none tracking-tight">{value}</p>
        {subValue && <p className="relative text-xs text-white/80 mt-1.5">{subValue}</p>}
        <p className="relative text-[11px] font-semibold uppercase tracking-wider text-white/75 mt-3">{label}</p>
      </div>
    );
  }

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/90 backdrop-blur-sm p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:border-border">
      {/* soft corner glow */}
      <div className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${a.glow} to-transparent blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />
      <div className="relative flex items-start justify-between mb-3.5">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-md ${a.chip}`}>
          {icon}
        </div>
        {gauge !== null && gauge !== undefined ? (
          <Donut value={gauge} />
        ) : trend !== null && trend !== undefined && trend !== 0 ? (
          <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${
            trendUp
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
          }`}>
            {trendUp   && <ArrowUpRight   className="h-3 w-3" />}
            {trendDown && <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trend)}{trendIsPoints ? " pp" : "%"}
          </span>
        ) : null}
      </div>
      <p className={`relative text-[28px] font-bold tabular-nums leading-none tracking-tight ${value === "—" ? "text-muted-foreground/40" : "text-foreground"}`}>
        {value}
      </p>
      {subValue && (
        <p className="relative text-xs text-muted-foreground mt-1.5">{subValue}</p>
      )}
      <p className="relative text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 mt-3">{label}</p>
    </div>
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

/* ─── Setup Banner ───────────────────────────────────────────────────────── */
interface SetupStep {
  icon: React.ReactNode;
  title: string;
  desc: string;
  cta: string;
  to: string;
  done: boolean;
}

function SetupBanner({
  waConnected,
  hasContacts,
  hasDeals,
  onDismiss,
}: {
  waConnected: boolean;
  hasContacts: boolean;
  hasDeals: boolean;
  onDismiss: () => void;
}) {
  const steps: SetupStep[] = [
    {
      icon: <MessageCircle className="h-5 w-5" />,
      title: "Conecta tu canal",
      desc: "WhatsApp, Instagram o Facebook Ads para capturar leads automáticamente.",
      cta: "Configurar ahora",
      to: "integrations",
      done: waConnected,
    },
    {
      icon: <Users className="h-5 w-5" />,
      title: "Agrega tu primer lead",
      desc: "Importa contactos o añade uno manualmente para empezar a trabajar.",
      cta: "Ir a contactos",
      to: "contacts",
      done: hasContacts,
    },
    {
      icon: <GitBranch className="h-5 w-5" />,
      title: "Abre un deal en el pipeline",
      desc: "Mueve un lead al pipeline y comienza a llevar el seguimiento comercial.",
      cta: "Ver pipeline",
      to: "pipeline",
      done: hasDeals,
    },
  ];

  const allDone = steps.every((s) => s.done);
  if (allDone) return null;

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Primeros pasos</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {doneCount} de {steps.length} completados — tu CRM está casi listo
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"
          title="Ocultar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Steps */}
      <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border/60">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`flex flex-col gap-3 p-5 transition-colors ${
              step.done ? "opacity-50" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className={`flex items-center justify-center h-9 w-9 rounded-lg shrink-0 ${
                step.done
                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : "bg-primary/10 text-primary"
              }`}>
                {step.done ? <CheckCircle2 className="h-5 w-5" /> : step.icon}
              </div>
              {step.done && (
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full shrink-0">
                  Listo
                </span>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{step.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.desc}</p>
            </div>
            {!step.done && (
              <Button asChild variant="outline" size="sm" className="w-fit text-xs mt-auto">
                <Link to={step.to}>{step.cta} →</Link>
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
/* ─── Welcome card (first-time greeting) ────────────────────────────────── */
function WelcomeCard({ userId, firstName }: { userId: string; firstName: string }) {
  const key = `klosify_welcomed_${userId}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show only once; a brief delay lets the page settle first
    if (!localStorage.getItem(key)) {
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, [key]);

  const dismiss = () => {
    localStorage.setItem(key, "1");
    setVisible(false);
  };

  if (!visible) return null;

  const benefits = [
    { icon: Users,       text: "Contactos, empresas y negocios en un solo lugar" },
    { icon: MessageCircle, text: "Automatiza mensajes por WhatsApp e Instagram" },
    { icon: GitBranch,   text: "Pipeline visual para cerrar más ventas" },
    { icon: Mail,        text: "Campañas de email y landing pages integradas" },
  ];

  return (
    <div
      className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-2xl border bg-card shadow-2xl overflow-hidden
                 animate-in slide-in-from-bottom-4 fade-in duration-500"
    >
      {/* Orange top accent bar */}
      <div className="h-1 w-full bg-gradient-to-r from-orange-400 to-orange-500" />

      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-orange-500 shadow-sm">
              <Zap className="h-5 w-5 text-white fill-white" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground leading-none mb-0.5">Klosify CRM</p>
              <p className="text-sm font-bold text-foreground leading-tight">
                ¡Bienvenido{firstName ? `, ${firstName}` : ""}! 👋
              </p>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="mt-0.5 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tagline */}
        <p className="text-xs text-muted-foreground leading-relaxed">
          Tu espacio de trabajo está listo. Esto es lo que puedes hacer:
        </p>

        {/* Benefits */}
        <ul className="space-y-2.5">
          {benefits.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <Icon className="h-3 w-3 text-primary" />
              </div>
              <span className="text-xs text-muted-foreground leading-snug">{text}</span>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <Button size="sm" className="w-full font-semibold" onClick={dismiss}>
          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          ¡Empezar a usar Klosify!
        </Button>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const greetingName =
    user?.user_metadata?.given_name ||
    user?.user_metadata?.full_name?.split(" ")[0] ||
    user?.user_metadata?.first_name || "";
  const { isVendor, myUserId } = usePermissions();
  const { organizationId } = useOrganizationContext();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("month");

  // Setup banner state
  const [waConnected, setWaConnected]   = useState(false);
  const [totalContacts, setTotalContacts] = useState(0);
  const [setupDismissed, setSetupDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`crm-setup-done-${organizationId}`) === "1";
    } catch { return false; }
  });

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

  // ── Dashboard personalization (per-user: order + hidden sections) ──────────
  const [dashOrder, setDashOrder] = useState<string[]>([...DASH_DEFAULT_ORDER]);
  const [dashHidden, setDashHidden] = useState<string[]>([]);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_dashboard_prefs").select("layout, hidden").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          const saved = Array.isArray(data.layout) ? (data.layout as string[]) : [];
          // Merge: keep saved order, append any new blocks not yet saved.
          const merged = [...saved.filter(id => DASH_DEFAULT_ORDER.includes(id)),
            ...DASH_DEFAULT_ORDER.filter(id => !saved.includes(id))];
          setDashOrder(merged);
          setDashHidden(Array.isArray(data.hidden) ? (data.hidden as string[]) : []);
        }
      });
  }, [user?.id]);

  const savePrefs = useCallback(async (order: string[], hidden: string[]) => {
    if (!user) return;
    await supabase.from("user_dashboard_prefs").upsert({
      user_id: user.id, layout: order, hidden, updated_at: new Date().toISOString(),
    });
  }, [user?.id]);

  const orderOf = (id: string) => { const i = dashOrder.indexOf(id); return i === -1 ? 99 : i; };
  const isHidden = (id: string) => dashHidden.includes(id);
  const toggleHidden = (id: string) => {
    const next = dashHidden.includes(id) ? dashHidden.filter(x => x !== id) : [...dashHidden, id];
    setDashHidden(next); savePrefs(dashOrder, next);
  };
  const moveBlock = (id: string, dir: -1 | 1) => {
    const i = dashOrder.indexOf(id); const j = i + dir;
    if (i < 0 || j < 0 || j >= dashOrder.length) return;
    const next = [...dashOrder]; [next[i], next[j]] = [next[j], next[i]];
    setDashOrder(next); savePrefs(next, dashHidden);
  };

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
      .select("id, name, order, color")
      .order("order", { ascending: true });

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

    // Setup banner: total contacts + WhatsApp config
    const totalCtQ = supabase.from("contacts").select("id", { count: "exact", head: true });
    const waQ      = supabase.from("whatsapp_configs").select("id").limit(1);

    const [
      curRes, prevRes, activeRes, stagesRes,
      lostRes, meetRes, taskRes, actRes, objRes,
      totalCtRes, waRes,
    ] = await Promise.all([
      curQ, prevQ, activeQ, stagesQ,
      lostQ, meetQ, taskQ, actQ, objQ,
      totalCtQ, waQ,
    ]);

    /* ---------- KPI calculations ---------- */
    const cur    = (curRes.data  || []) as unknown as KpiContactRow[];
    const prev   = (prevRes.data || []) as unknown as KpiContactRow[];
    const active = (activeRes.data || []) as unknown as KpiContactRow[];

    const wonCur  = cur.filter((d) => d.lead_status === "won");
    const lostCur = cur.filter((d) => d.lead_status === "lost");
    const wv  = wonCur.reduce((s, d) => s + Number(d.budget || 0), 0);
    const wc  = wonCur[0]?.budget_currency || "USD";
    setWonValue(wv);
    setWonCurrency(wc);
    setWonCount(wonCur.length);
    setLostCount(lostCur.length);
    setAvgDeal(wonCur.length > 0 ? Math.round(wv / wonCur.length) : 0);

    const wonPrev  = prev.filter((d) => d.lead_status === "won");
    const lostPrev = prev.filter((d) => d.lead_status === "lost");
    setPrevWonVal(wonPrev.reduce((s, d) => s + Number(d.budget || 0), 0));
    setPrevWonN(wonPrev.length);
    setPrevLostN(lostPrev.length);

    const pv = active.reduce((s, d) => s + Number(d.budget || 0), 0);
    const pc = active[0]?.budget_currency || "USD";
    setPipelineVal(pv);
    setPipelineCur(pc);
    setPipelineN(active.length);

    /* ---------- Funnel ---------- */
    const stages = (stagesRes.data || []) as unknown as StageDbRow[];
    const sMap = new Map<string, { count: number; value: number }>();
    for (const c of active) {
      if (!c.stage_id) continue;
      const p = sMap.get(c.stage_id) || { count: 0, value: 0 };
      sMap.set(c.stage_id, { count: p.count + 1, value: p.value + Number(c.budget || 0) });
    }
    setStageData(
      stages.map((s) => ({
        id: s.id, name: s.name, position: (s as any).order ?? (s as any).position, color: s.color,
        ...(sMap.get(s.id) || { count: 0, value: 0 }),
      }))
    );

    /* ---------- Lost reasons ---------- */
    const rMap = new Map<string, number>();
    for (const row of (lostRes.data || []) as unknown as LostReasonRow[])
      if (row.lost_reason) rMap.set(row.lost_reason, (rMap.get(row.lost_reason) || 0) + 1);
    setLostReasons([...rMap.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count })));

    /* ---------- Objections ---------- */
    const oMap = new Map<string, number>();
    (objRes.data || []).forEach((row) => {
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

    /* ---------- Setup banner ---------- */
    setTotalContacts(totalCtRes.count ?? 0);
    setWaConnected((waRes.data?.length ?? 0) > 0);

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

  const dismissSetup = useCallback(() => {
    try { localStorage.setItem(`crm-setup-done-${organizationId}`, "1"); } catch {}
    setSetupDismissed(true);
  }, [organizationId]);

  /* ─── Render ────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <AppLayout>
        <AppHeader
          title="Dashboard"
          subtitle={format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })}
        />
        <main className="flex-1 flex items-center justify-center p-4">
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
      <main className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4 md:gap-6 scrollbar-thin">

        {/* ── Setup banner (shown to new workspaces) ─────────────── */}
        {!setupDismissed && (
          <div style={{ order: -3 }}>
          <SetupBanner
            waConnected={waConnected}
            hasContacts={totalContacts > 0}
            hasDeals={pipelineN > 0}
            onDismiss={dismissSetup}
          />
          </div>
        )}

        {/* ── Greeting hero ──────────────────────────────────────── */}
        <div style={{ order: -2 }} className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-orange-500 via-orange-500 to-amber-500 px-5 py-5 md:px-7 md:py-6 text-white shadow-sm">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute right-16 -bottom-16 h-40 w-40 rounded-full bg-black/5 blur-2xl" />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-medium text-white/80 capitalize">{format(new Date(), "EEEE, d 'de' MMMM", { locale: es })}</p>
              <h1 className="text-2xl md:text-[28px] font-bold tracking-tight mt-0.5">
                {(() => { const h = new Date().getHours(); return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches"; })()}
                {greetingName ? `, ${greetingName}` : ""} 👋
              </h1>
              <p className="text-sm text-white/85 mt-1">Esto es lo que está pasando en tu negocio hoy.</p>
            </div>
            <div className="flex items-center gap-5 shrink-0">
              <div className="text-right">
                <p className="text-2xl font-bold tabular-nums leading-none">{fmt(totalContacts)}</p>
                <p className="text-[11px] text-white/80 mt-1">Total leads</p>
              </div>
              <div className="h-9 w-px bg-white/25" />
              <div className="text-right">
                <p className="text-2xl font-bold tabular-nums leading-none">{fmt(pipelineN)}</p>
                <p className="text-[11px] text-white/80 mt-1">En pipeline</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Header bar ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" style={{ order: -1 }}>
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">Resumen de rendimiento</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Tu negocio de un vistazo</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 rounded-lg" onClick={() => setCustomizeOpen(true)}>
              <Sliders className="h-3.5 w-3.5" /> Personalizar
            </Button>
            <PeriodSelector value={period} onChange={setPeriod} />
          </div>
        </div>

        {/* ── 5 KPI cards ────────────────────────────────────────── */}
        <div style={{ order: orderOf("kpis") }} hidden={isHidden("kpis")}>
        <div className="grid gap-3 md:gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
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
            highlight
          />
          <KpiCard
            label="Win Rate"
            value={winRate !== null ? `${winRate}%` : "—"}
            subValue={
              winRate !== null
                ? `${wonCount} ganados · ${lostCount} perdidos`
                : "Sin datos en el período"
            }
            gauge={winRate}
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
        </div>

        {/* ── Insights: leads, agent, campaigns, conversion, vendors ── */}
        <div style={{ order: orderOf("insights") }} hidden={isHidden("insights")}>
        <DashboardInsights
          stageData={stageData.map((s) => ({ name: s.name, count: s.count, color: s.color }))}
          isOwner={!isVendor}
          vendorId={isVendor && myUserId ? myUserId : null}
        />
        </div>

        {/* ── Pipeline funnel + Loss reasons ─────────────────────── */}
        <div style={{ order: orderOf("funnel") }} hidden={isHidden("funnel")}>
        <div className="grid gap-4 md:gap-6 lg:grid-cols-3">

          {/* Funnel — takes 2/3 */}
          <Card className="rounded-2xl border border-border/60 shadow-sm lg:col-span-2">
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
          <Card className="rounded-2xl border border-border/60 shadow-sm">
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
        </div>

        {/* ── Activity row ───────────────────────────────────────── */}
        <div style={{ order: orderOf("agenda") }} hidden={isHidden("agenda")}>
        <div className="grid gap-4 md:gap-6 lg:grid-cols-3">

          {/* Upcoming meetings */}
          <Card className="rounded-2xl border border-border/60 shadow-sm">
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
          <Card className="rounded-2xl border border-border/60 shadow-sm">
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
          <Card className="rounded-2xl border border-border/60 shadow-sm">
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
        </div>

        {/* ── Objections (only if data exists) ───────────────────── */}
        {topObjections.length > 0 && (
          <div style={{ order: orderOf("objections") }} hidden={isHidden("objections")}>
          <Card className="rounded-2xl border border-border/60 shadow-sm">
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
          </div>
        )}

      </main>

      {/* ── Customize dashboard modal ─────────────────────────────── */}
      <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sliders className="h-4 w-4" /> Personalizar dashboard</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Muestra/oculta y reordena las secciones. Se guarda solo para ti.</p>
          <div className="space-y-2 mt-2">
            {dashOrder.map((id, idx) => {
              const block = DASH_BLOCKS.find(b => b.id === id);
              if (!block) return null;
              const hidden = isHidden(id);
              return (
                <div key={id} className="flex items-center gap-2 rounded-lg border p-2.5">
                  <div className="flex flex-col">
                    <button disabled={idx === 0} onClick={() => moveBlock(id, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                    <button disabled={idx === dashOrder.length - 1} onClick={() => moveBlock(id, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                  </div>
                  <span className={`flex-1 text-sm ${hidden ? "text-muted-foreground line-through" : ""}`}>{block.label}</span>
                  {hidden ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-primary" />}
                  <Switch checked={!hidden} onCheckedChange={() => toggleHidden(id)} />
                </div>
              );
            })}
          </div>
          <button
            className="mt-2 text-xs text-muted-foreground hover:text-foreground underline self-start"
            onClick={() => { setDashOrder([...DASH_DEFAULT_ORDER]); setDashHidden([]); savePrefs([...DASH_DEFAULT_ORDER], []); }}
          >
            Restablecer al orden original
          </button>
        </DialogContent>
      </Dialog>

      {/* First-time welcome message */}
      {myUserId && (
        <WelcomeCard
          userId={myUserId}
          firstName={
            user?.user_metadata?.given_name ||
            user?.user_metadata?.full_name?.split(" ")[0] ||
            ""
          }
        />
      )}
    </AppLayout>
  );
}
