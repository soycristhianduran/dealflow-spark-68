/**
 * PlatformPage — founder-only SaaS health monitor (all orgs, plans, consumption
 * vs limits, infra cost + upgrade flags). Data + access gate come from the
 * platform-stats edge function (403 if the caller isn't a platform admin).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowLeft, AlertTriangle, CheckCircle2, TrendingUp, Bot, Mail, Database, DollarSign, Cloud } from "lucide-react";

const money = (n: number) => `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const flagColor = (f: string) =>
  f === "over" ? "bg-red-500" : f === "near" ? "bg-amber-500" : "bg-emerald-500";

function Bar({ m, label }: { m: any; label: string }) {
  const unlimited = m.limit == null;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium">
          {Number(m.used).toLocaleString()} {unlimited ? "/ ∞" : `/ ${Number(m.limit).toLocaleString()}`}
        </span>
      </div>
      {!unlimited && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={`h-full ${flagColor(m.flag)}`} style={{ width: `${Math.min(m.pct ?? 0, 100)}%` }} />
        </div>
      )}
    </div>
  );
}

export default function PlatformPage() {
  const [data, setData] = useState<any>(null);
  const [trend, setTrend] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.functions.invoke("platform-stats", { body: {} });
      if (error) setError("No autorizado o error al cargar.");
      else if (data?.error) setError(data.error);
      else setData(data);
      supabase.from("platform_daily_stats")
        .select("snapshot_date, mrr_usd, ai_cost_usd, infra_cost_usd, resend_emails, active_orgs")
        .order("snapshot_date", { ascending: false }).limit(14)
        .then(({ data }) => setTrend(data ?? []));
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error) return (
    <div className="min-h-screen grid place-items-center text-center p-6">
      <div>
        <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Link to="/" className="text-sm text-primary mt-3 inline-block">Volver</Link>
      </div>
    </div>
  );

  const s = data.summary;
  return (
    <div className="min-h-screen bg-background text-foreground p-5 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
        <div>
          <h1 className="text-xl font-bold">Panel de Plataforma</h1>
          <p className="text-xs text-muted-foreground">Estado del SaaS · {new Date(data.generated_at).toLocaleString("es")}</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Orgs activas", value: `${s.active_orgs} / ${s.total_orgs}`, icon: TrendingUp },
          { label: "MRR", value: money(s.mrr_usd), icon: DollarSign },
          { label: "Costo infra/mes", value: money(s.infra_month_usd), icon: Database },
          { label: "Margen bruto", value: `${s.mrr_usd > 0 ? Math.round((1 - s.infra_month_usd / s.mrr_usd) * 100) : 0}%`, icon: CheckCircle2 },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card p-4">
            <k.icon className="h-4 w-4 text-muted-foreground mb-2" />
            <div className="text-lg font-bold">{k.value}</div>
            <div className="text-[11px] text-muted-foreground">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Distribución por plan */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Orgs por plan (activas)</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(s.by_plan).map(([plan, n]: any) => (
            <span key={plan} className="px-2.5 py-1 rounded-full bg-muted text-xs font-medium capitalize">{plan}: {n}</span>
          ))}
        </div>
      </div>

      {/* Infraestructura */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Anthropic */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2"><Bot className="h-4 w-4 text-violet-500" /><h3 className="text-sm font-semibold">Costo IA (real)</h3></div>
          <div className="text-2xl font-bold">{money(s.anthropic_month_usd)}<span className="text-xs font-normal text-muted-foreground">/mes</span></div>
          <div className="text-[11px] text-muted-foreground space-y-0.5">
            <div>Agente de Chat (Anthropic): {money(data.anthropic.agent_usd)}</div>
            <div>IA Landings (Anthropic): {money(data.anthropic.landings_usd)}</div>
            <div>Análisis de llamadas (Anthropic): {money(data.anthropic.call_usd)}</div>
            <div>Análisis de leads (OpenAI): {money(data.anthropic.openai_analysis_usd)}</div>
            <div>Asistente CRM (OpenAI): {money(data.anthropic.openai_assistant_usd)}</div>
          </div>
          <p className="text-[10px] text-muted-foreground">Tokens reales. Pago por uso — sin límite duro, vigila el costo.</p>
        </div>

        {/* Resend */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-sky-500" /><h3 className="text-sm font-semibold">Resend (Email)</h3></div>
          <div className="text-2xl font-bold">{data.resend.emails_this_month.toLocaleString()}<span className="text-xs font-normal text-muted-foreground"> correos</span></div>
          <Bar m={{ used: data.resend.emails_this_month, limit: data.resend.cap, pct: data.resend.pct, flag: data.resend.upgrade ? "near" : "ok" }} label={`Plan ${data.resend.tier}`} />
          <p className={`text-[11px] ${data.resend.upgrade ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>{data.resend.suggestion}</p>
        </div>

        {/* Supabase */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2"><Database className="h-4 w-4 text-emerald-500" /><h3 className="text-sm font-semibold">Supabase</h3></div>
          <div className="text-lg font-bold">{data.supabase.mau}<span className="text-xs font-normal text-muted-foreground"> MAU · {data.supabase.total_users} usuarios</span></div>
          <Bar m={{ used: data.supabase.db_size_gb, limit: data.supabase.db_included_gb, pct: data.supabase.db_pct, flag: data.supabase.upgrade ? "near" : "ok" }} label="DB (GB)" />
          <Bar m={{ used: data.supabase.storage_gb, limit: data.supabase.storage_included_gb, pct: data.supabase.storage_pct, flag: "ok" }} label="Storage (GB)" />
          <p className="text-[10px] text-muted-foreground">{data.supabase.note}</p>
        </div>

        {/* Stripe */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-purple-500" /><h3 className="text-sm font-semibold">Stripe (comisiones)</h3></div>
          <div className="text-2xl font-bold">{data.stripe.fees_this_month_usd < 0 ? "—" : money(data.stripe.fees_this_month_usd)}<span className="text-xs font-normal text-muted-foreground">/mes</span></div>
          <p className="text-[10px] text-muted-foreground">{data.stripe.note}</p>
        </div>

        {/* Vercel */}
        {data.vercel?.available && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2"><Cloud className="h-4 w-4 text-foreground" /><h3 className="text-sm font-semibold">Vercel (Hosting)</h3></div>
            <div className="text-lg font-bold capitalize">
              {data.vercel.plan} · <span className={data.vercel.last_deploy_state === "READY" ? "text-emerald-500" : "text-amber-500"}>{data.vercel.last_deploy_state}</span>
            </div>
            <div className="text-[11px] text-muted-foreground space-y-0.5">
              <div>Deploys (30d): {data.vercel.deploys_30d}</div>
              <div>Límites: {data.vercel.limits}</div>
            </div>
            <p className="text-[10px] text-muted-foreground">{data.vercel.note}</p>
          </div>
        )}
      </div>

      {/* Salud de integraciones */}
      {data.integrations?.whatsapp && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Integraciones · salud</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div>
              <div className="font-semibold">WhatsApp</div>
              <div className="text-xs text-muted-foreground">{data.integrations.whatsapp.active} activos / {data.integrations.whatsapp.total}</div>
              <div className="text-[11px] text-muted-foreground">Webhook OK: {data.integrations.whatsapp.webhook_ok}</div>
            </div>
            <div>
              <div className="font-semibold">Instagram</div>
              <div className="text-xs text-muted-foreground">{data.integrations.instagram.active} activos / {data.integrations.instagram.total}</div>
              <div className={`text-[11px] ${data.integrations.instagram.needs_reconnect > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                Reconectar: {data.integrations.instagram.needs_reconnect}
              </div>
            </div>
            <div>
              <div className="font-semibold">Google Calendar</div>
              <div className="text-xs text-muted-foreground">{data.integrations.google_calendar.connected} conectados</div>
            </div>
            <div>
              <div className="font-semibold">Voz (Vapi)</div>
              <div className="text-xs text-muted-foreground">{data.integrations.voice_vapi.active} activos / {data.integrations.voice_vapi.total}</div>
            </div>
            <div>
              <div className="font-semibold">Meta Ads</div>
              <div className="text-xs text-muted-foreground">{data.integrations.meta_ads.orgs_connected} orgs</div>
            </div>
          </div>
        </div>
      )}

      {/* Tendencia diaria */}
      {trend.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground p-4 pb-2">Tendencia (snapshot diario)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="text-left font-medium px-4 py-2">Fecha</th>
                  <th className="text-right font-medium px-4 py-2">Orgs</th>
                  <th className="text-right font-medium px-4 py-2">MRR</th>
                  <th className="text-right font-medium px-4 py-2">Costo IA</th>
                  <th className="text-right font-medium px-4 py-2">Infra</th>
                  <th className="text-right font-medium px-4 py-2">Correos</th>
                </tr>
              </thead>
              <tbody>
                {trend.map((d) => (
                  <tr key={d.snapshot_date} className="border-b border-border/40 last:border-0">
                    <td className="px-4 py-2">{new Date(d.snapshot_date).toLocaleDateString("es", { day: "2-digit", month: "short" })}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{d.active_orgs}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(Number(d.mrr_usd))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(Number(d.ai_cost_usd))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(Number(d.infra_cost_usd))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{Number(d.resend_emails).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground px-4 py-2">Valores acumulados del mes; se actualiza cada día 00:05 UTC.</p>
        </div>
      )}

      {/* Tabla por org */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground p-4 pb-2">Organizaciones · consumo vs límites (este mes)</h2>
        <div className="divide-y divide-border">
          {data.orgs.filter((o: any) => o.active).map((o: any) => (
            <div key={o.org_id} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{o.name}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase bg-muted capitalize">{o.plan}</span>
                  <span className="text-[10px] text-muted-foreground">{o.status}</span>
                </div>
                <span className="text-xs text-muted-foreground">Costo IA: <b className="text-foreground">{money(o.month_cost_usd)}</b></span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2">
                <Bar m={o.usage.users} label="Usuarios" />
                <Bar m={o.usage.contacts} label="Contactos" />
                <Bar m={o.usage.email} label="Correos" />
                <Bar m={o.usage.agent_credits} label="Créditos Agente" />
                <Bar m={o.usage.ai_analyses} label="Análisis IA" />
                <Bar m={o.usage.ai_assistant} label="Asistente IA" />
              </div>
              {(o.addon_balances.agent_credits > 0 || o.addon_balances.landing_credits > 0 || o.addon_balances.boost > 0) && (
                <div className="text-[10px] text-muted-foreground">
                  Add-ons: {o.addon_balances.agent_credits} créd. agente · {o.addon_balances.landing_credits} créd. landings · {o.addon_balances.boost} boost
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
