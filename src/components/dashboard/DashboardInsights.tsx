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
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { TrendingUp, Users, Bot, Send, GitBranch, UserCheck, ArrowRight } from "lucide-react";

interface StageDatum { name: string; count: number; color?: string | null }

interface FunnelStage { name: string; count: number; color?: string | null }
interface Insights {
  leads: { today: number; week: number; month: number; total: number };
  trend: { d: string; n: number }[];
  sources: { source: string; n: number }[];
  agent: { sessions_month: number; escalations_month: number };
  funnels: { pipeline_id: string; pipeline_name: string; stages: FunnelStage[] }[];
  vendors: { owner_id: string; leads: number; citas: number; cierres: number; revenue: number }[];
}

const fmtMoney = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
};

const SOURCE_LABELS: Record<string, string> = {
  facebook_ads: "Meta Ads", facebook: "Facebook", instagram: "Instagram",
  api: "API", "Importación CSV": "Importación", whatsapp: "WhatsApp",
};
const srcLabel = (s: string) => SOURCE_LABELS[s] || s;

function Sparkline({ data }: { data: number[] }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const w = 240, h = 48, step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((v, i) => `${i * step},${h - (v / max) * (h - 6) - 3}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="#f97316" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function DashboardInsights({ isOwner, vendorId }: { stageData?: StageDatum[]; isOwner: boolean; vendorId: string | null }) {
  const { organizationId } = useOrganizationContext();
  const [data, setData] = useState<Insights | null>(null);
  const [lastCamp, setLastCamp] = useState<any>(null);
  const [vendorNames, setVendorNames] = useState<Record<string, string>>({});
  const [pipelineIdx, setPipelineIdx] = useState(0);

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
      // Resolve advisor names (owner view)
      if (isOwner) {
        const { data: members } = await supabase.functions.invoke("org-invitations", { body: { action: "list_members" } });
        const map: Record<string, string> = {};
        for (const m of (members?.members || [])) map[m.user_id] = m.full_name || m.email || "—";
        setVendorNames(map);
      }
    })();
  }, [organizationId, isOwner, vendorId]);

  if (!data) return null;

  // Build a continuous 30-day series from the sparse trend
  const byDay = new Map(data.trend.map(t => [t.d, t.n]));
  const series: number[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    series.push(byDay.get(d) || 0);
  }
  const maxSource = Math.max(...data.sources.map(s => s.n), 1);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Lead acquisition */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-orange-500" /> Adquisición de leads</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-4 gap-2 text-center">
            {[["Hoy", data.leads.today], ["7 días", data.leads.week], ["30 días", data.leads.month], ["Total", data.leads.total]].map(([l, v]) => (
              <div key={l as string} className="rounded-lg bg-muted/50 py-2">
                <p className="text-lg font-bold tabular-nums">{(v as number).toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground">{l}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground mb-1">Últimos 30 días</p>
            <Sparkline data={series} />
          </div>
          {data.sources.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted-foreground">Por fuente (30 días)</p>
              {data.sources.slice(0, 5).map(s => (
                <div key={s.source} className="flex items-center gap-2">
                  <span className="text-xs w-28 truncate">{srcLabel(s.source)}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-orange-400" style={{ width: `${(s.n / maxSource) * 100}%` }} />
                  </div>
                  <span className="text-xs font-medium tabular-nums w-12 text-right">{s.n.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        {/* Agent + conversations */}
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Bot className="h-4 w-4 text-indigo-500" /> Agente IA (30 días)</CardTitle>
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
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Send className="h-4 w-4 text-green-500" /> Última campaña</CardTitle>
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
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2"><GitBranch className="h-4 w-4 text-blue-500" /> Conversión del embudo</CardTitle>
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
              return fn.stages.map((s, i) => {
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
              });
            })()}
            <p className="text-[11px] text-muted-foreground pt-1">El % es la conversión desde la etapa anterior.</p>
          </CardContent>
        </Card>

        {/* Per-advisor (owner only) */}
        {isOwner && (
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><UserCheck className="h-4 w-4 text-violet-500" /> Por vendedor</CardTitle>
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
                    <span className="text-center"><b className="block text-emerald-600 text-xs">{v.cierres}</b>cierres</span>
                    <span className="text-center"><b className="block text-emerald-600 text-xs">{v.revenue > 0 ? fmtMoney(v.revenue) : "—"}</b>ventas</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
