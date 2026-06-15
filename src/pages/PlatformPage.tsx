/**
 * PlatformPage — founder-only SaaS health monitor. Premium, theme-adaptive UI.
 * Data + access gate come from the platform-stats edge function (403 if not a
 * platform admin).
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

const CARD = "rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-white/[0.08] dark:bg-white/[0.03] dark:shadow-none";

const dot = (f: string) =>
  f === "over" ? "bg-rose-500" : f === "near" ? "bg-amber-500" : "bg-emerald-500";
const barColor = (f: string) =>
  f === "over" ? "bg-rose-500" : f === "near" ? "bg-amber-500" : "bg-emerald-500";

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
      <div className="h-1.5 rounded-full bg-black/[0.05] dark:bg-white/[0.06] overflow-hidden">
        {unlimited
          ? <div className="h-full w-full bg-gradient-to-r from-emerald-400/30 to-emerald-500/30" />
          : <div className={`h-full rounded-full ${barColor(m.flag)} transition-all`} style={{ width: `${Math.min(m.pct ?? 0, 100)}%` }} />}
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
    <div className="min-h-screen grid place-items-center bg-[#fafafa] dark:bg-[#0a0a0b]">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
  if (error) return (
    <div className="min-h-screen grid place-items-center text-center p-6 bg-[#fafafa] dark:bg-[#0a0a0b]">
      <div>
        <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Link to="/" className="text-sm text-primary mt-3 inline-block">Volver</Link>
      </div>
    </div>
  );

  const s = data.summary;
  const margin = s.mrr_usd > 0 ? Math.round((1 - s.infra_month_usd / s.mrr_usd) * 100) : 0;

  const kpis = [
    { label: "MRR real", value: money(s.mrr_usd), sub: s.mrr_trials_usd > 0 ? `+${money(s.mrr_trials_usd)} en trials` : "ingresos cobrados", icon: DollarSign, grad: "from-violet-500 to-indigo-500" },
    { label: "Margen bruto", value: `${margin}%`, sub: `infra ${money(s.infra_month_usd)}/mes`, icon: TrendingUp, grad: "from-emerald-500 to-teal-500" },
    { label: "Clientes pagando", value: `${s.paying_orgs ?? 0}`, sub: `${s.trial_orgs ?? 0} en prueba · ${s.total_orgs} totales`, icon: Activity, grad: "from-sky-500 to-cyan-500" },
    { label: "Costo IA", value: money(s.anthropic_month_usd), sub: "tokens reales/mes", icon: Sparkles, grad: "from-amber-500 to-orange-500" },
  ];

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0b] text-foreground">
      {/* Hero */}
      <div className="border-b border-black/[0.06] dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.02] backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="grid place-items-center h-9 w-9 rounded-xl border border-black/[0.06] dark:border-white/[0.08] text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                <Server className="h-4 w-4 text-violet-500" /> Panel de Plataforma
              </h1>
              <p className="text-[11px] text-muted-foreground">Estado del SaaS · {new Date(data.generated_at).toLocaleString("es")}</p>
            </div>
          </div>
          <button onClick={load} disabled={loading}
            className="grid place-items-center h-9 w-9 rounded-xl border border-black/[0.06] dark:border-white/[0.08] text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-5 md:px-8 py-6 space-y-8">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <div key={k.label} className={`${CARD} p-5 relative overflow-hidden group`}>
              <div className={`absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br ${k.grad} opacity-[0.08] blur-xl group-hover:opacity-[0.14] transition-opacity`} />
              <div className={`inline-grid place-items-center h-9 w-9 rounded-xl bg-gradient-to-br ${k.grad} text-white shadow-sm mb-3`}>
                <k.icon className="h-4 w-4" />
              </div>
              <div className="text-2xl font-semibold tracking-tight">{k.value}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{k.label}</div>
              <div className="text-[10px] text-muted-foreground/70 mt-1">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Infra */}
        <div>
          <SectionTitle>Costo de infraestructura · tiempo real</SectionTitle>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* IA */}
            <div className={`${CARD} p-5 space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Bot className="h-4 w-4 text-violet-500" /><h3 className="text-sm font-semibold">Costo IA</h3></div>
                <span className="text-lg font-semibold tracking-tight">{money(s.anthropic_month_usd)}<span className="text-[11px] font-normal text-muted-foreground">/mes</span></span>
              </div>
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
              <p className="text-[10px] text-muted-foreground/70 pt-1 border-t border-border/50">Tokens reales · pago por uso</p>
            </div>

            {/* Resend */}
            <div className={`${CARD} p-5 space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-sky-500" /><h3 className="text-sm font-semibold">Resend · Email</h3></div>
                <span className="text-lg font-semibold tracking-tight">{compact(data.resend.emails_this_month)}<span className="text-[11px] font-normal text-muted-foreground"> correos</span></span>
              </div>
              <Bar m={{ used: data.resend.emails_this_month, limit: data.resend.cap, pct: data.resend.pct, flag: data.resend.upgrade ? "near" : "ok" }} label={`Plan ${data.resend.tier}`} />
              <p className={`text-[10px] ${data.resend.upgrade ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/70"}`}>{data.resend.suggestion}</p>
            </div>

            {/* Supabase */}
            <div className={`${CARD} p-5 space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Database className="h-4 w-4 text-emerald-500" /><h3 className="text-sm font-semibold">Supabase</h3></div>
                <span className="text-sm font-medium text-muted-foreground">{data.supabase.mau} MAU · {data.supabase.total_users} users</span>
              </div>
              <Bar m={{ used: data.supabase.db_size_gb, limit: data.supabase.db_included_gb, pct: data.supabase.db_pct, flag: data.supabase.upgrade ? "near" : "ok" }} label="DB (GB)" />
              <Bar m={{ used: data.supabase.storage_gb, limit: data.supabase.storage_included_gb, pct: data.supabase.storage_pct, flag: "ok" }} label="Storage (GB)" />
              <p className="text-[10px] text-muted-foreground/70">Egress/invocations: dashboard de Supabase</p>
            </div>

            {/* Stripe */}
            <div className={`${CARD} p-5 space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-purple-500" /><h3 className="text-sm font-semibold">Stripe · Comisiones</h3></div>
                <span className="text-lg font-semibold tracking-tight">{data.stripe.fees_this_month_usd < 0 ? "—" : money(data.stripe.fees_this_month_usd)}<span className="text-[11px] font-normal text-muted-foreground">/mes</span></span>
              </div>
              <p className="text-[11px] text-muted-foreground">{data.stripe.paying_subs ?? 0} suscripciones activas</p>
              <p className="text-[10px] text-muted-foreground/70">{data.stripe.note}</p>
            </div>

            {/* Vercel */}
            {data.vercel?.available && (
              <div className={`${CARD} p-5 space-y-3`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Cloud className="h-4 w-4 text-foreground/70" /><h3 className="text-sm font-semibold">Vercel · Hosting</h3></div>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium">
                    <span className={`h-1.5 w-1.5 rounded-full ${data.vercel.last_deploy_state === "READY" ? "bg-emerald-500" : "bg-amber-500"}`} />
                    {data.vercel.last_deploy_state}
                  </span>
                </div>
                <div className="text-sm font-medium">Plan {data.vercel.plan}</div>
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <div>Deploys (30d): {data.vercel.deploys_30d}</div>
                  <div>{data.vercel.limits}</div>
                </div>
              </div>
            )}

            {/* Cloudflare */}
            {data.cloudflare?.available && (
              <div className={`${CARD} p-5 space-y-3`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Cloud className="h-4 w-4 text-orange-500" /><h3 className="text-sm font-semibold">Cloudflare · CDN</h3></div>
                  <span className="text-lg font-semibold tracking-tight">{compact(data.cloudflare.requests_30d)}<span className="text-[11px] font-normal text-muted-foreground"> req</span></span>
                </div>
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <div>Transferencia: {data.cloudflare.gb_30d} GB · 30d</div>
                  <div>Caché: {data.cloudflare.cached_pct}% · Plan {data.cloudflare.plan}</div>
                </div>
              </div>
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
                      <span className={`h-1.5 w-1.5 rounded-full ${i.ok ? "bg-emerald-500" : "bg-amber-500"}`} />
                      <span className="text-xs font-semibold">{i.name}</span>
                    </div>
                    <div className="text-lg font-semibold tracking-tight">{i.main}</div>
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
                      <tr key={d.snapshot_date} className="border-b border-border/40 last:border-0 hover:bg-black/[0.015] dark:hover:bg-white/[0.02]">
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
              <p className="text-[10px] text-muted-foreground/70 px-5 py-2.5 border-t border-border/40">Valores acumulados del mes · se actualiza cada día 00:05 UTC</p>
            </div>
          </div>
        )}

        {/* Orgs */}
        <div>
          <SectionTitle>Organizaciones · consumo vs límites (mes)</SectionTitle>
          <div className="space-y-3">
            {data.orgs.filter((o: any) => o.active).map((o: any) => (
              <div key={o.org_id} className={`${CARD} p-5 space-y-4`}>
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
                    Add-ons activos: {o.addon_balances.agent_credits} créd. agente · {o.addon_balances.landing_credits} créd. landings · {o.addon_balances.boost} boost
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
