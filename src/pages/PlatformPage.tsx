/**
 * PlatformPage — founder-only SaaS health monitor. Styled to match the CRM
 * dashboard (gradient hero, highlight KPI, gradient icon chips, depth + lift).
 * Data + access gate come from the platform-stats edge function.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, ArrowLeft, AlertTriangle, TrendingUp, Bot, Mail, Database, DollarSign,
  Cloud, Activity, Server, Sparkles, RefreshCw,
} from "lucide-react";

const money = (n: number) =>
  `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const compact = (n: number) => Number(n ?? 0).toLocaleString("en-US");

// Dashboard-matched surfaces
const CARD = "rounded-2xl border border-border/60 bg-card/90 backdrop-blur-sm shadow-sm dark:bg-slate-900/50 dark:border-white/[0.08] dark:shadow-lg dark:shadow-black/20";

const ACCENT: Record<string, { chip: string; glow: string }> = {
  emerald: { chip: "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-emerald-500/25", glow: "from-emerald-500/10" },
  blue:    { chip: "bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-blue-500/25",          glow: "from-blue-500/10" },
  orange:  { chip: "bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-orange-500/25",    glow: "from-orange-500/10" },
  violet:  { chip: "bg-gradient-to-br from-violet-400 to-violet-600 text-white shadow-violet-500/25",    glow: "from-violet-500/10" },
  sky:     { chip: "bg-gradient-to-br from-sky-400 to-cyan-600 text-white shadow-sky-500/25",            glow: "from-sky-500/10" },
  purple:  { chip: "bg-gradient-to-br from-fuchsia-400 to-purple-600 text-white shadow-purple-500/25",   glow: "from-purple-500/10" },
};

function barColor(f: string) {
  return f === "over" ? "bg-rose-500" : f === "near" ? "bg-amber-500" : "bg-emerald-500";
}

function Bar({ m, label }: { m: any; label: string }) {
  const unlimited = m.limit == null;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium text-foreground/80">
          {compact(m.used)} <span className="text-muted-foreground">{unlimited ? "/ ∞" : `/ ${compact(m.limit)}`}</span>
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        {unlimited
          ? <div className="h-full w-full bg-gradient-to-r from-emerald-400/40 to-emerald-500/40" />
          : <div className={`h-full rounded-full ${barColor(m.flag)} transition-all duration-500`} style={{ width: `${Math.min(m.pct ?? 0, 100)}%` }} />}
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, icon, accent, highlight }: any) {
  if (highlight) {
    return (
      <div className="group relative overflow-hidden rounded-2xl p-4 shadow-lg shadow-indigo-500/20 bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-600 text-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-500/30">
        <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/15 blur-2xl" />
        <div className="pointer-events-none absolute -left-6 -bottom-10 h-28 w-28 rounded-full bg-black/10 blur-2xl" />
        <div className="relative">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm text-white mb-3">{icon}</div>
          <div className="text-2xl font-bold tracking-tight">{value}</div>
          <div className="text-[11px] text-white/80 mt-0.5">{label}</div>
          <div className="text-[10px] text-white/65 mt-1">{sub}</div>
        </div>
      </div>
    );
  }
  const a = ACCENT[accent] ?? ACCENT.blue;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/90 backdrop-blur-sm p-4 shadow-sm dark:bg-slate-900/50 dark:border-white/[0.08] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:border-border">
      <div className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${a.glow} to-transparent blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />
      <div className="relative">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-md ${a.chip} mb-3`}>{icon}</div>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
        <div className="text-[10px] text-muted-foreground/70 mt-1">{sub}</div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{children}</h2>
      <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
    </div>
  );
}

function InfraCard({ icon, title, right, children }: any) {
  return (
    <div className={`${CARD} p-4 space-y-3 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">{icon}<h3 className="text-sm font-semibold">{title}</h3></div>
        {right}
      </div>
      {children}
    </div>
  );
}

export default function PlatformPage() {
  const [data, setData] = useState<any>(null);
  const [trend, setTrend] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("platform-stats", { body: {} });
    if (error) setError("No autorizado o error al cargar.");
    else if (data?.error) setError(data.error);
    else { setData(data); setError(null); }
    supabase.from("platform_daily_stats")
      .select("snapshot_date, ai_cost_usd, infra_cost_usd, resend_emails, active_orgs")
      .order("snapshot_date", { ascending: false }).limit(14)
      .then(({ data }) => setTrend(data ?? []));
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  if (loading && !data) return (
    <div className="min-h-screen grid place-items-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  );
  if (error) return (
    <div className="min-h-screen grid place-items-center text-center p-6 bg-background">
      <div>
        <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Link to="/" className="text-sm text-primary mt-3 inline-block">Volver</Link>
      </div>
    </div>
  );

  const s = data.summary;
  const margin = s.mrr_usd > 0 ? Math.round((1 - s.infra_month_usd / s.mrr_usd) * 100) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-5 md:py-7 space-y-7">

        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl px-5 py-5 md:px-7 md:py-6 text-white shadow-lg ring-1 ring-white/10 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 shadow-violet-500/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 dark:shadow-slate-900/40">
          <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-orange-500/30 blur-3xl" />
          <div className="pointer-events-none absolute -left-10 -bottom-20 h-48 w-48 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link to="/" className="grid place-items-center h-9 w-9 rounded-xl bg-white/15 backdrop-blur-sm text-white/90 hover:bg-white/25 transition-colors shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
                  <Server className="h-5 w-5 text-orange-300" /> Panel de Plataforma
                </h1>
                <p className="text-xs text-white/70 mt-0.5">Estado del SaaS · {new Date(data.generated_at).toLocaleString("es")}</p>
              </div>
            </div>
            <button onClick={load} disabled={loading}
              className="grid place-items-center h-9 w-9 rounded-xl bg-white/15 backdrop-blur-sm text-white/90 hover:bg-white/25 transition-colors shrink-0">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard highlight label="MRR real" value={money(s.mrr_usd)} sub={s.mrr_trials_usd > 0 ? `+${money(s.mrr_trials_usd)} en trials` : "ingresos cobrados"} icon={<DollarSign className="h-4 w-4" />} />
          <KpiCard accent="emerald" label="Margen bruto" value={`${margin}%`} sub={`infra ${money(s.infra_month_usd)}/mes`} icon={<TrendingUp className="h-4 w-4" />} />
          <KpiCard accent="sky" label="Clientes pagando" value={`${s.paying_orgs ?? 0}`} sub={`${s.trial_orgs ?? 0} prueba · ${s.total_orgs} totales`} icon={<Activity className="h-4 w-4" />} />
          <KpiCard accent="orange" label="Costo IA" value={money(s.anthropic_month_usd)} sub="tokens reales/mes" icon={<Sparkles className="h-4 w-4" />} />
        </div>

        {/* Infra */}
        <div>
          <SectionTitle>Costo de infraestructura · tiempo real</SectionTitle>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <InfraCard icon={<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-400 to-violet-600 text-white shadow-md shadow-violet-500/25"><Bot className="h-3.5 w-3.5" /></span>} title="Costo IA"
              right={<span className="text-lg font-bold tracking-tight">{money(s.anthropic_month_usd)}<span className="text-[11px] font-normal text-muted-foreground">/mes</span></span>}>
              <div className="space-y-1 text-[11px]">
                {[
                  ["Agente de Chat", data.anthropic.agent_usd, "Anthropic"],
                  ["IA Landings", data.anthropic.landings_usd, "Anthropic"],
                  ["Análisis llamadas", data.anthropic.call_usd, "Anthropic"],
                  ["Análisis leads", data.anthropic.openai_analysis_usd, "OpenAI"],
                  ["Asistente CRM", data.anthropic.openai_assistant_usd, "OpenAI"],
                ].map(([l, v, p]: any) => (
                  <div key={l} className="flex justify-between items-center py-0.5">
                    <span className="text-muted-foreground">{l} <span className="text-muted-foreground/50">· {p}</span></span>
                    <span className="tabular-nums font-medium">{money(v)}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/70 pt-2 border-t border-border/50">Tokens reales · pago por uso</p>
            </InfraCard>

            <InfraCard icon={<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-cyan-600 text-white shadow-md shadow-sky-500/25"><Mail className="h-3.5 w-3.5" /></span>} title="Resend · Email"
              right={<span className="text-lg font-bold tracking-tight">{compact(data.resend.emails_this_month)}<span className="text-[11px] font-normal text-muted-foreground"> correos</span></span>}>
              <Bar m={{ used: data.resend.emails_this_month, limit: data.resend.cap, pct: data.resend.pct, flag: data.resend.upgrade ? "near" : "ok" }} label={`Plan ${data.resend.tier}`} />
              <p className={`text-[10px] ${data.resend.upgrade ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/70"}`}>{data.resend.suggestion}</p>
            </InfraCard>

            <InfraCard icon={<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-md shadow-emerald-500/25"><Database className="h-3.5 w-3.5" /></span>} title="Supabase"
              right={<span className="text-sm font-medium text-muted-foreground">{data.supabase.mau} MAU</span>}>
              <Bar m={{ used: data.supabase.db_size_gb, limit: data.supabase.db_included_gb, pct: data.supabase.db_pct, flag: data.supabase.upgrade ? "near" : "ok" }} label="DB (GB)" />
              <Bar m={{ used: data.supabase.storage_gb, limit: data.supabase.storage_included_gb, pct: data.supabase.storage_pct, flag: "ok" }} label="Storage (GB)" />
              <p className="text-[10px] text-muted-foreground/70">{data.supabase.total_users} usuarios · egress en dashboard</p>
            </InfraCard>

            <InfraCard icon={<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-400 to-purple-600 text-white shadow-md shadow-purple-500/25"><DollarSign className="h-3.5 w-3.5" /></span>} title="Stripe · Comisiones"
              right={<span className="text-lg font-bold tracking-tight">{data.stripe.fees_this_month_usd < 0 ? "—" : money(data.stripe.fees_this_month_usd)}<span className="text-[11px] font-normal text-muted-foreground">/mes</span></span>}>
              <p className="text-[11px] text-muted-foreground">{data.stripe.paying_subs ?? 0} suscripciones activas</p>
              <p className="text-[10px] text-muted-foreground/70">{data.stripe.note}</p>
            </InfraCard>

            {data.vercel?.available && (
              <InfraCard icon={<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow-md"><Cloud className="h-3.5 w-3.5" /></span>} title="Vercel · Hosting"
                right={<span className="inline-flex items-center gap-1.5 text-[11px] font-medium"><span className={`h-1.5 w-1.5 rounded-full ${data.vercel.last_deploy_state === "READY" ? "bg-emerald-500" : "bg-amber-500"}`} />{data.vercel.last_deploy_state}</span>}>
                <div className="text-sm font-medium">Plan {data.vercel.plan}</div>
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <div>Deploys (30d): {data.vercel.deploys_30d}</div>
                  <div>{data.vercel.limits}</div>
                </div>
              </InfraCard>
            )}

            {data.cloudflare?.available && (
              <InfraCard icon={<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-md shadow-orange-500/25"><Cloud className="h-3.5 w-3.5" /></span>} title="Cloudflare · CDN"
                right={<span className="text-lg font-bold tracking-tight">{compact(data.cloudflare.requests_30d)}<span className="text-[11px] font-normal text-muted-foreground"> req</span></span>}>
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <div>Transferencia: {data.cloudflare.gb_30d} GB · 30d</div>
                  <div>Caché: {data.cloudflare.cached_pct}% · Plan {data.cloudflare.plan}</div>
                </div>
              </InfraCard>
            )}
          </div>
        </div>

        {/* Integraciones */}
        {data.integrations?.whatsapp && (
          <div>
            <SectionTitle>Integraciones · salud</SectionTitle>
            <div className={`${CARD} p-5`}>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-5">
                {[
                  { name: "WhatsApp", main: `${data.integrations.whatsapp.active}/${data.integrations.whatsapp.total}`, sub: `Webhook OK: ${data.integrations.whatsapp.webhook_ok}`, ok: true },
                  { name: "Instagram", main: `${data.integrations.instagram.active}/${data.integrations.instagram.total}`, sub: `Reconectar: ${data.integrations.instagram.needs_reconnect}`, ok: data.integrations.instagram.needs_reconnect === 0 },
                  { name: "Google Calendar", main: `${data.integrations.google_calendar.connected}`, sub: "conectados", ok: true },
                  { name: "Voz · Vapi", main: `${data.integrations.voice_vapi.active}/${data.integrations.voice_vapi.total}`, sub: "activos", ok: true },
                  { name: "Meta Ads", main: `${data.integrations.meta_ads.orgs_connected}`, sub: "orgs", ok: true },
                ].map((i) => (
                  <div key={i.name} className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${i.ok ? "bg-emerald-500" : "bg-amber-500"}`} />
                      <span className="text-xs font-semibold">{i.name}</span>
                    </div>
                    <div className="text-xl font-bold tracking-tight">{i.main}</div>
                    <div className={`text-[10px] ${i.ok ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"}`}>{i.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tendencia */}
        {trend.length > 0 && (
          <div>
            <SectionTitle>Tendencia · snapshot diario</SectionTitle>
            <div className={`${CARD} overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border/60">
                      <th className="text-left font-medium px-5 py-3">Fecha</th>
                      <th className="text-right font-medium px-5 py-3">Orgs</th>
                      <th className="text-right font-medium px-5 py-3">Costo IA</th>
                      <th className="text-right font-medium px-5 py-3">Infra</th>
                      <th className="text-right font-medium px-5 py-3">Correos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trend.map((d) => (
                      <tr key={d.snapshot_date} className="border-b border-border/40 last:border-0 hover:bg-muted/40 transition-colors">
                        <td className="px-5 py-2.5">{new Date(d.snapshot_date).toLocaleDateString("es", { day: "2-digit", month: "short" })}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums">{d.active_orgs}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums">{money(Number(d.ai_cost_usd))}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums">{money(Number(d.infra_cost_usd))}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums">{compact(Number(d.resend_emails))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-muted-foreground/70 px-5 py-2.5 border-t border-border/40">Acumulado del mes · actualiza cada día 00:05 UTC</p>
            </div>
          </div>
        )}

        {/* Orgs */}
        <div>
          <SectionTitle>Organizaciones · consumo vs límites (mes)</SectionTitle>
          <div className="space-y-3">
            {data.orgs.filter((o: any) => o.active).map((o: any) => (
              <div key={o.org_id} className={`${CARD} p-5 space-y-4 transition-all duration-300 hover:shadow-lg`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-sm">{o.name}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-violet-500/10 text-violet-600 dark:text-violet-400 capitalize">{o.plan}</span>
                    <span className={`inline-flex items-center gap-1 text-[10px] ${o.status === "active" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${o.status === "active" ? "bg-emerald-500" : "bg-amber-500"}`} />{o.status}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">Costo IA: <b className="text-foreground tabular-nums">{money(o.month_cost_usd)}</b></span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-3">
                  <Bar m={o.usage.users} label="Usuarios" />
                  <Bar m={o.usage.contacts} label="Contactos" />
                  <Bar m={o.usage.email} label="Correos" />
                  <Bar m={o.usage.agent_credits} label="Créditos Agente" />
                  <Bar m={o.usage.ai_analyses} label="Análisis IA" />
                  <Bar m={o.usage.ai_assistant} label="Asistente IA" />
                </div>
                {(o.addon_balances.agent_credits > 0 || o.addon_balances.landing_credits > 0 || o.addon_balances.boost > 0) && (
                  <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                    Add-ons: {o.addon_balances.agent_credits} créd. agente · {o.addon_balances.landing_credits} créd. landings · {o.addon_balances.boost} boost
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}
