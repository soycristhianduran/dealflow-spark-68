/**
 * DashboardInsights — extra value widgets for the dashboard:
 *  • Lead acquisition (today/week/month + 30-day trend + by source)
 *  • Conversations & AI agent (sessions handled, escalations)
 *  • Last campaign performance (WhatsApp)
 *  • Funnel conversion (stage-to-stage)
 *  • Per-advisor performance (owner-only)
 *
 * Heavy aggregation runs server-side in the `dashboard_extra` RPC.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { formatMoney } from "@/lib/money";
import { TrendingUp, Users, Bot, Send, GitBranch, UserCheck, ArrowRight, DollarSign, ShieldAlert, ThumbsUp } from "lucide-react";

interface StageDatum { name: string; count: number; color?: string | null }

interface FunnelStage { name: string; count: number; color?: string | null }
interface Insights {
  leads: { today: number; week: number; month: number; total: number };
  trend: { d: string; n: number }[];
  sources: { source: string; n: number }[];
  agent: { sessions_month: number; escalations_month: number };
  funnels: { pipeline_id: string; pipeline_name: string; stages: FunnelStage[] }[];
  vendors: { owner_id: string; leads: number; citas: number; cierres: number; perdidos: number; revenue: number }[];
}


// Keyword categorizer — groups many phrasings into a few buckets.
const OBJECTION_CATS: { key: string; words: string[] }[] = [
  { key: "Precio / Costoso", words: ["precio", "caro", "costoso", "costos", "plata", "dinero", "presupuesto", "barato", "económic", "economic", "cuesta", "vale", "no tengo", "sin plata"] },
  { key: "Falta de tiempo", words: ["tiempo", "después", "despues", "luego", "ocupad", "más adelante", "mas adelante", "pensar", "ahora no", "ya veremos"] },
  { key: "Desconfianza / Dudas", words: ["confian", "seguro", "estafa", "garant", "duda", "verdad", "real", "serio"] },
  { key: "Competencia", words: ["otro lado", "competencia", "otra empresa", "comparar", "cotiz", "más barato en"] },
  { key: "No le interesa", words: ["no necesito", "no me interesa", "no busco", "no quiero", "no gracias"] },
  { key: "Ubicación", words: ["lejos", "ubicación", "ubicacion", "zona", "distancia", "muy retirado"] },
  { key: "Financiación", words: ["crédit", "credit", "cuotas", "financ", "banco", "contado"] },
];
const SIGNAL_CATS: { key: string; words: string[] }[] = [
  { key: "Interés alto", words: ["me interesa", "interesad", "interés", "interes", "quiero", "me gustaría", "me gustaria", "cuéntame", "cuentame"] },
  { key: "Pide info / material", words: ["información", "informacion", "más info", "mas info", "brochure", "brichure", "folleto", "catálogo", "catalogo", "recibir", "enviar", "detalles", "ficha"] },
  { key: "Precio / Promoción", words: ["precio", "precios", "costo", "cuánto", "cuanto", "vale", "lanzamiento", "promoción", "promocion", "oferta", "descuento", "cotiz"] },
  { key: "Listo para agendar", words: ["agendar", "cita", "reunión", "reunion", "visita", "ver el proyecto", "disponible", "cuándo", "cuando"] },
  { key: "Presupuesto OK", words: ["tengo", "puedo pagar", "de contado", "capacidad", "presupuesto disponible"] },
  { key: "Urgencia", words: ["ya", "pronto", "rápido", "rapido", "urgente", "esta semana", "hoy", "inmediato"] },
  { key: "Intención de compra", words: ["comprar", "adquirir", "invertir", "separar", "reservar", "cerrar", "prueba", "empezar", "plan pro"] },
  { key: "Ubicación / Zona", words: ["ubicación", "ubicacion", "zona", "dónde queda", "donde queda", "dirección", "direccion"] },
];
function categorize(text: string, cats: { key: string; words: string[] }[]): string {
  const t = (text || "").toLowerCase();
  for (const c of cats) if (c.words.some(w => t.includes(w))) return c.key;
  return "Otros";
}
function groupItems(items: string[], cats: { key: string; words: string[] }[]) {
  const m = new Map<string, string[]>();
  for (const it of items) { const k = categorize(it, cats); const arr = m.get(k) || []; arr.push(it); m.set(k, arr); }
  return [...m.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([key, examples]) => ({ key, n: examples.length, examples }));
}

const SOURCE_LABELS: Record<string, string> = {
  facebook_ads: "Meta Ads", facebook: "Facebook", instagram: "Instagram",
  api: "API", "Importación CSV": "Importación", whatsapp: "WhatsApp",
};
const srcLabel = (s: string) => SOURCE_LABELS[s] || s;

// Smooth (Catmull-Rom → bezier) path for a premium area chart.
function smoothLine(pts: [number, number][]): string {
  if (pts.length < 2) return pts.length ? `M ${pts[0][0]},${pts[0][1]}` : "";
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

// Radial gauge with centered label — theme-adaptive premium ring.
function RadialGauge({ value, label, sub }: { value: number; label: string; sub?: string }) {
  const size = 132, stroke = 12, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));
  const off = c * (1 - pct / 100);
  const color = pct >= 50 ? "#10b981" : pct >= 25 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <filter id="gauge-glow"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          stroke={color} strokeDasharray={c} strokeDashoffset={off} opacity={0.35} filter="url(#gauge-glow)" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          stroke={color} strokeDasharray={c} strokeDashoffset={off} style={{ transition: "stroke-dashoffset .7s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums tracking-tight">{Math.round(pct)}%</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        {sub && <span className="text-[10px] text-muted-foreground mt-0.5">{sub}</span>}
      </div>
    </div>
  );
}

const SRC_COLORS = ["#f97316", "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#64748b"];
function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}
function SourceDonut({ sources }: { sources: { source: string; n: number }[] }) {
  const top = sources.slice(0, 5);
  const restN = sources.slice(5).reduce((s, x) => s + x.n, 0);
  const segs = top.map((s, i) => ({ label: srcLabel(s.source), n: s.n, color: SRC_COLORS[i] }));
  if (restN > 0) segs.push({ label: "Otros", n: restN, color: SRC_COLORS[5] });
  const total = segs.reduce((s, x) => s + x.n, 0) || 1;
  const size = 124, stroke = 16, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted/60" />
          {segs.map((seg, i) => {
            const dash = c * (seg.n / total);
            const el = (
              <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
                stroke={seg.color} strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-acc}
                style={{ transition: "stroke-dashoffset .6s ease" }} />
            );
            acc += dash;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tabular-nums tracking-tight">{compact(total)}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Leads</span>
        </div>
      </div>
      <div className="flex-1 space-y-1.5 min-w-0">
        {segs.map((seg, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: seg.color }} />
            <span className="flex-1 truncate font-medium">{seg.label}</span>
            <span className="tabular-nums font-bold">{seg.n.toLocaleString()}</span>
            <span className="tabular-nums text-muted-foreground w-9 text-right">{Math.round((seg.n / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  if (!data.length) return <div className="h-28" />;
  const w = 600, h = 120, padY = 12;
  const max = Math.max(...data, 1);
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((v, i) => [i * step, h - padY - (v / max) * (h - padY * 2)] as [number, number]);
  const line = smoothLine(pts);
  const area = `${line} L ${w},${h} L 0,${h} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-28" preserveAspectRatio="none">
      <defs>
        <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
        </linearGradient>
        <filter id="trend-glow" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <path d={area} fill="url(#trend-fill)" />
      <path d={line} fill="none" stroke="#f97316" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" filter="url(#trend-glow)" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r={6} fill="#f97316" opacity={0.25} />
      <circle cx={last[0]} cy={last[1]} r={3.5} fill="#f97316" />
    </svg>
  );
}

export function DashboardInsights({ isOwner, vendorId }: { stageData?: StageDatum[]; isOwner: boolean; vendorId: string | null }) {
  const { organizationId, defaultCurrency } = useOrganizationContext();
  const fmtMoney = (n: number) => formatMoney(n, defaultCurrency, { compact: true });
  const [data, setData] = useState<Insights | null>(null);
  const [lastCamp, setLastCamp] = useState<any>(null);
  const [vendorNames, setVendorNames] = useState<Record<string, string>>({});
  const [pipelineIdx, setPipelineIdx] = useState(0);
  const [groupedObj, setGroupedObj] = useState<{ key: string; n: number; examples: string[] }[]>([]);
  const [groupedSig, setGroupedSig] = useState<{ key: string; n: number; examples: string[] }[]>([]);
  const [adsRoas, setAdsRoas] = useState<any[]>([]);
  const [roasLevel, setRoasLevel] = useState<"campaign" | "ad">("campaign");
  const [adModal, setAdModal] = useState<any | null>(null);
  const [adPreview, setAdPreview] = useState<{ loading: boolean; html?: string; error?: string }>({ loading: false });

  const openAd = (row: any) => {
    // Defer to the next frame so the originating click doesn't get caught by the
    // dialog's outside-pointer detection and close it immediately.
    requestAnimationFrame(() => {
      setAdModal(row);
      if (roasLevel !== "ad" || !row.id) { setAdPreview({ loading: false }); return; }
      setAdPreview({ loading: true });
      supabase.functions.invoke("meta-ad-preview", { body: { ad_id: row.id } }).then(({ data, error }) => {
        if (data?.preview_html) setAdPreview({ loading: false, html: data.preview_html });
        else setAdPreview({ loading: false, error: data?.message || data?.error || error?.message || "No disponible" });
      });
    });
  };

  useEffect(() => {
    if (!organizationId) return;
    (async () => {
      const { data: ins } = await supabase.rpc("dashboard_extra", { p_org: organizationId, p_vendor: vendorId });
      if (ins) setData(ins as Insights);
      // Last WhatsApp campaign
      const { data: camp } = await supabase.from("whatsapp_campaigns")
        .select("name, total_recipients, sent_count, delivered_count, read_count, failed_count, sent_at, status")
        .eq("status", "sent").order("sent_at", { ascending: false }).limit(1).maybeSingle();
      setLastCamp(camp);
      // Grouped objections + positive signals (categorize raw AI analysis arrays)
      const { data: analyses } = await supabase.from("contact_ai_analyses")
        .select("objections, signals_detected").order("analyzed_at", { ascending: false }).limit(1000);
      const objs: string[] = [];
      const sigs: string[] = [];
      for (const a of (analyses || [])) {
        if (Array.isArray(a.objections)) objs.push(...a.objections.map(String));
        if (Array.isArray(a.signals_detected)) sigs.push(...a.signals_detected.map(String));
      }
      setGroupedObj(groupItems(objs, OBJECTION_CATS));
      setGroupedSig(groupItems(sigs, SIGNAL_CATS));


      // Resolve advisor names (owner view)
      if (isOwner) {
        const { data: members } = await supabase.functions.invoke("org-invitations", { body: { action: "list_members" } });
        const map: Record<string, string> = {};
        for (const m of (members?.members || [])) map[m.user_id] = m.full_name || m.email || "—";
        setVendorNames(map);
      }
    })();
  }, [organizationId, isOwner, vendorId]);

  // Ads ROAS — re-fetch when the campaign/ad level toggles
  useEffect(() => {
    if (!organizationId) return;
    supabase.rpc("dashboard_ads_roas", { p_org: organizationId, p_level: roasLevel })
      .then(({ data }) => { if (Array.isArray(data)) setAdsRoas(data); });
  }, [organizationId, roasLevel]);

  if (!data) return null;

  // Build a continuous 30-day series from the sparse trend
  const byDay = new Map(data.trend.map(t => [t.d, t.n]));
  const series: number[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    series.push(byDay.get(d) || 0);
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Lead acquisition */}
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm dark:bg-slate-900/50 dark:border-white/[0.08] dark:shadow-lg dark:shadow-black/20">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-md shadow-orange-500/25">
            <TrendingUp className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-bold text-foreground">Adquisición de leads</h3>
        </div>
        <div className="space-y-5">
          <div className="grid grid-cols-4 gap-2.5 text-center">
            {[["Hoy", data.leads.today], ["7 días", data.leads.week], ["30 días", data.leads.month], ["Total", data.leads.total]].map(([l, v]) => (
              <div key={l as string} className="rounded-xl border border-border/50 bg-gradient-to-b from-muted/40 to-transparent py-3">
                <p className="text-xl font-bold tabular-nums tracking-tight">{(v as number).toLocaleString()}</p>
                <p className="text-[11px] font-medium text-muted-foreground mt-0.5">{l}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 mb-1.5">Últimos 30 días</p>
            <Sparkline data={series} />
          </div>
          {data.sources.length > 0 && (
            <div className="space-y-2.5 pt-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">Por fuente (30 días)</p>
              <SourceDonut sources={data.sources} />
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        {/* Agent + conversations */}
        <Card className="rounded-2xl border border-border/60 shadow-sm dark:bg-slate-900/50 dark:border-white/[0.08] dark:shadow-lg dark:shadow-black/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-400 to-indigo-600 text-white shadow-sm shadow-indigo-500/25"><Bot className="h-3.5 w-3.5" /></span> Agente IA (30 días)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/30 p-3 text-center">
                <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">{data.agent.sessions_month.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">conversaciones atendidas</p>
              </div>
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3 text-center">
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">{data.agent.escalations_month.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">escaladas a humano</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              {data.agent.sessions_month > 0
                ? `El agente resolvió ${Math.round(((data.agent.sessions_month - data.agent.escalations_month) / data.agent.sessions_month) * 100)}% sin intervención humana.`
                : "Activa el Agente IA para automatizar tus conversaciones."}
            </p>
          </CardContent>
        </Card>

        {/* Last campaign */}
        <Card className="rounded-2xl border border-border/60 shadow-sm dark:bg-slate-900/50 dark:border-white/[0.08] dark:shadow-lg dark:shadow-black/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-green-400 to-green-600 text-white shadow-sm shadow-green-500/25"><Send className="h-3.5 w-3.5" /></span> Última campaña</CardTitle>
          </CardHeader>
          <CardContent>
            {lastCamp ? (
              <>
                <p className="text-sm font-semibold truncate">{lastCamp.name}</p>
                <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                  <div><p className="text-base font-bold tabular-nums">{lastCamp.total_recipients}</p><p className="text-[10px] text-muted-foreground">destinatarios</p></div>
                  <div><p className="text-base font-bold text-blue-600 tabular-nums">{lastCamp.sent_count}</p><p className="text-[10px] text-muted-foreground">enviados</p></div>
                  <div><p className="text-base font-bold text-teal-600 tabular-nums">{lastCamp.delivered_count}</p><p className="text-[10px] text-muted-foreground">entregados</p></div>
                  <div><p className="text-base font-bold text-green-600 tabular-nums">{lastCamp.read_count}</p><p className="text-[10px] text-muted-foreground">leídos</p></div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">Aún no has enviado campañas.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        {/* Funnel conversion — per pipeline */}
        <Card className="rounded-2xl border border-border/60 shadow-sm dark:bg-slate-900/50 dark:border-white/[0.08] dark:shadow-lg dark:shadow-black/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-sm shadow-blue-500/25"><GitBranch className="h-3.5 w-3.5" /></span> Conversión del embudo</CardTitle>
              {data.funnels.length > 1 && (
                <select
                  value={pipelineIdx}
                  onChange={e => setPipelineIdx(Number(e.target.value))}
                  className="h-7 rounded-md border bg-background px-2 text-xs max-w-[150px]"
                >
                  {data.funnels.map((f, i) => <option key={f.pipeline_id} value={i}>{f.pipeline_name}</option>)}
                </select>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {(() => {
              const fn = data.funnels[pipelineIdx];
              if (!fn || fn.stages.length === 0) return <p className="text-sm text-muted-foreground py-4 text-center">Sin etapas en este pipeline.</p>;
              const first = fn.stages[0]?.count || 0;
              const last = fn.stages[fn.stages.length - 1]?.count || 0;
              const overall = first > 0 ? (last / first) * 100 : 0;
              return (<>
                <div className="flex items-center justify-center pb-3">
                  <RadialGauge value={overall} label="Conversión" sub={`${last} de ${first}`} />
                </div>
                {fn.stages.map((s, i) => {
                const prev = i > 0 ? fn.stages[i - 1].count : null;
                const conv = prev && prev > 0 ? Math.round((s.count / prev) * 100) : null;
                return (
                  <div key={s.name + i} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color || "#94a3b8" }} />
                    <span className="text-xs flex-1 truncate">{s.name}</span>
                    <span className="text-xs font-semibold tabular-nums">{s.count}</span>
                    {conv !== null && (
                      <span className={`text-[10px] tabular-nums w-12 text-right ${conv >= 50 ? "text-emerald-600" : conv >= 25 ? "text-amber-600" : "text-red-500"}`}>
                        {conv}%
                      </span>
                    )}
                  </div>
                );
              })}
              </>);
            })()}
            <p className="text-[11px] text-muted-foreground pt-1">El % es la conversión desde la etapa anterior.</p>
          </CardContent>
        </Card>

        {/* Per-advisor (owner only) */}
        {isOwner && (
          <Card className="rounded-2xl border border-border/60 shadow-sm dark:bg-slate-900/50 dark:border-white/[0.08] dark:shadow-lg dark:shadow-black/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-400 to-violet-600 text-white shadow-sm shadow-violet-500/25"><UserCheck className="h-3.5 w-3.5" /></span> Por vendedor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.vendors.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Aún no hay leads asignados a vendedores.</p>
              ) : data.vendors.map(v => (
                <div key={v.owner_id} className="flex items-center gap-2 rounded-lg border p-2.5">
                  <div className="h-7 w-7 rounded-full bg-violet-100 dark:bg-violet-950 flex items-center justify-center text-[11px] font-semibold text-violet-700 dark:text-violet-300 shrink-0">
                    {(vendorNames[v.owner_id] || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-sm flex-1 truncate min-w-0">{vendorNames[v.owner_id] || "Vendedor"}</span>
                  <div className="flex items-center gap-3 shrink-0 text-[11px] text-muted-foreground">
                    <span className="text-center"><b className="block text-foreground text-xs">{v.leads.toLocaleString()}</b>leads</span>
                    <span className="text-center"><b className="block text-foreground text-xs">{v.citas}</b>citas</span>
                    <span className="text-center"><b className="block text-emerald-600 dark:text-emerald-400 text-xs">{v.cierres}</b>ganados</span>
                    <span className="text-center"><b className="block text-red-500 text-xs">{v.perdidos ?? 0}</b>perdidos</span>
                    <span className="text-center"><b className="block text-foreground text-xs">{v.revenue > 0 ? fmtMoney(v.revenue) : "—"}</b>ventas</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Ads performance / ROAS */}
      {adsRoas.length > 0 && (
        <Card className="rounded-2xl border border-border/60 shadow-sm dark:bg-slate-900/50 dark:border-white/[0.08] dark:shadow-lg dark:shadow-black/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-sm shadow-emerald-500/25"><DollarSign className="h-3.5 w-3.5" /></span> Rendimiento de anuncios (Meta Ads)</CardTitle>
              <div className="flex items-center gap-1 rounded-lg border bg-muted/50 p-0.5">
                {(["campaign", "ad"] as const).map(lvl => (
                  <button key={lvl} onClick={() => setRoasLevel(lvl)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${roasLevel === lvl ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>
                    {lvl === "campaign" ? "Por campaña" : "Por anuncio"}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left font-medium py-2 pr-2">{roasLevel === "ad" ? "Anuncio" : "Campaña"}</th>
                    <th className="text-right font-medium py-2 px-2">Inversión</th>
                    <th className="text-right font-medium py-2 px-2">Leads</th>
                    <th className="text-right font-medium py-2 px-2">CPL</th>
                    <th className="text-right font-medium py-2 px-2">Citas</th>
                    <th className="text-right font-medium py-2 px-2">Cierres</th>
                    <th className="text-right font-medium py-2 px-2">Ventas</th>
                    <th className="text-right font-medium py-2 pl-2">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {adsRoas.map((a, i) => (
                    <tr key={i} onClick={() => openAd(a)} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer">
                      <td className="py-2 pr-2 font-medium truncate max-w-[160px]">{a.campaign}</td>
                      <td className="text-right py-2 px-2 tabular-nums">{a.spend ? fmtMoney(a.spend) : "—"}</td>
                      <td className="text-right py-2 px-2 tabular-nums">{a.leads}</td>
                      <td className="text-right py-2 px-2 tabular-nums text-muted-foreground">{a.cpl ? fmtMoney(a.cpl) : "—"}</td>
                      <td className="text-right py-2 px-2 tabular-nums">{a.citas}</td>
                      <td className="text-right py-2 px-2 tabular-nums text-emerald-600 font-semibold">{a.cierres}</td>
                      <td className="text-right py-2 px-2 tabular-nums text-emerald-600">{a.revenue > 0 ? fmtMoney(a.revenue) : "—"}</td>
                      <td className={`text-right py-2 pl-2 tabular-nums font-bold ${a.roas == null ? "text-muted-foreground" : a.roas >= 1 ? "text-emerald-600" : "text-red-500"}`}>
                        {a.roas != null ? `${a.roas}x` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              ROAS = ventas ÷ inversión. Se calcula cuando hay cierres ganados con presupuesto. Inversión y ventas deben estar en la misma moneda.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Ad detail modal */}
      <Dialog open={!!adModal} onOpenChange={(v) => { if (!v) { setAdModal(null); setAdPreview({ loading: false }); } }}>
        <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{adModal?.campaign}</DialogTitle>
          </DialogHeader>
          {adModal && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-4 gap-2 text-center">
                {[["Inversión", adModal.spend ? fmtMoney(adModal.spend) : "—"], ["Leads", adModal.leads], ["CPL", adModal.cpl ? fmtMoney(adModal.cpl) : "—"], ["Citas", adModal.citas]].map(([l, v]) => (
                  <div key={l as string} className="rounded-lg bg-muted/50 py-2"><p className="text-base font-bold tabular-nums">{v as any}</p><p className="text-[10px] text-muted-foreground">{l}</p></div>
                ))}
                {[["Cierres", adModal.cierres], ["Ventas", adModal.revenue > 0 ? fmtMoney(adModal.revenue) : "—"], ["ROAS", adModal.roas != null ? `${adModal.roas}x` : "—"]].map(([l, v]) => (
                  <div key={l as string} className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 py-2"><p className="text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{v as any}</p><p className="text-[10px] text-muted-foreground">{l}</p></div>
                ))}
              </div>

              {/* Creative preview (ad level) */}
              {roasLevel === "ad" && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Vista del anuncio</p>
                  {adPreview.loading ? (
                    <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">Cargando vista…</div>
                  ) : adPreview.html ? (
                    <div className="rounded-lg border overflow-hidden bg-white flex justify-center" dangerouslySetInnerHTML={{ __html: adPreview.html }} />
                  ) : (
                    <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                      {adPreview.error || "Vista no disponible."}<br />
                      <a href={`https://business.facebook.com/adsmanager/manage/ads?selected_ad_ids=${adModal.id}`} target="_blank" rel="noopener noreferrer" className="text-primary underline mt-1 inline-block">Ver en Meta Ads Manager →</a>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Grouped objections + positive signals — always visible (shows empty state) */}
      {(
        <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
          <Card className="rounded-2xl border border-border/60 shadow-sm dark:bg-slate-900/50 dark:border-white/[0.08] dark:shadow-lg dark:shadow-black/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-red-400 to-red-600 text-white shadow-sm shadow-red-500/25"><ShieldAlert className="h-3.5 w-3.5" /></span> Objeciones agrupadas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {groupedObj.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3 text-center">Aún no hay objeciones analizadas.</p>
              ) : groupedObj.map((o) => {
                const max = groupedObj[0].n;
                return (
                  <div key={o.key} className="flex items-center gap-2" title={o.examples.join(" · ")}>
                    <span className="text-xs w-36 truncate">{o.key}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-red-400" style={{ width: `${(o.n / max) * 100}%` }} />
                    </div>
                    <span className="text-xs font-medium tabular-nums w-8 text-right">{o.n}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <Card className="rounded-2xl border border-border/60 shadow-sm dark:bg-slate-900/50 dark:border-white/[0.08] dark:shadow-lg dark:shadow-black/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-sm shadow-emerald-500/25"><ThumbsUp className="h-3.5 w-3.5" /></span> Señales positivas agrupadas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {groupedSig.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3 text-center">Aún no hay señales analizadas.</p>
              ) : groupedSig.map((sg) => {
                const max = groupedSig[0].n;
                return (
                  <div key={sg.key} className="flex items-center gap-2" title={sg.examples.join(" · ")}>
                    <span className="text-xs w-36 truncate">{sg.key}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-400" style={{ width: `${(sg.n / max) * 100}%` }} />
                    </div>
                    <span className="text-xs font-medium tabular-nums w-8 text-right">{sg.n}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
