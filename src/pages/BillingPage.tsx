/**
 * BillingPage — inside-workspace view of the user's current plan + usage.
 *
 * Shows:
 *   - Current plan + price
 *   - Trial countdown (if applicable)
 *   - Usage bars: AI analyses, AI objections, automated messages, email sends
 *   - AI Boost credits remaining
 *   - "Manage billing" button → Stripe Customer Portal
 *   - "Upgrade" button → Stripe Checkout for higher plan
 *
 * Heavy lifting lives in Edge Functions; this page is mostly a read-only view.
 */

import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { CreditCard, Sparkles, ExternalLink, CheckCircle2, Loader2, Bot, Zap, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { IA_BOOST_PACKS, IA_LANDINGS_PACKS, IA_AGENT_PACKS } from "@/lib/stripe-products";

interface UsageRow {
  ai_analyses_used: number;
  automated_messages_used: number;
  email_sends_used: number;
  ai_agent_conversations_used: number;
}

export default function BillingPage() {
  const { subscription, daysLeftInTrial, loading: subLoading, refetch } = useSubscription();
  const { organizationId } = useOrganizationContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [usage, setUsage] = useState<UsageRow | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [boostCredits, setBoostCredits] = useState<number>(0);
  const [landingCredits, setLandingCredits] = useState<number>(0);
  const [agentCredits, setAgentCredits] = useState<number>(0);
  const [landingUsageLog, setLandingUsageLog] = useState<Array<{
    created_at: string; call_type: string; tokens_total: number; tokens_input: number; tokens_output: number;
  }>>([]);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [purchasingBoost, setPurchasingBoost] = useState<string | null>(null);

  // Show toast on checkout return (run once on mount)
  useEffect(() => {
    const checkoutStatus = searchParams.get("checkout_status");
    if (checkoutStatus === "success" && !sessionStorage.getItem("billing_toast_shown")) {
      sessionStorage.setItem("billing_toast_shown", "1");
      toast.success("¡Pago exitoso! Tu plan está activo.");
      refetch();
      const next = new URLSearchParams(searchParams);
      next.delete("checkout_status");
      setSearchParams(next, { replace: true });
    } else if (checkoutStatus === "canceled" && !sessionStorage.getItem("billing_toast_shown")) {
      sessionStorage.setItem("billing_toast_shown", "1");
      toast.info("Cancelaste el pago. Puedes intentarlo de nuevo cuando quieras.");
      const next = new URLSearchParams(searchParams);
      next.delete("checkout_status");
      setSearchParams(next, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [usageError, setUsageError] = useState<string | null>(null);

  // Load usage counters + boost credits
  useEffect(() => {
    if (!organizationId) { setUsageLoading(false); return; }
    setUsageLoading(true);
    setUsageError(null);
    (async () => {
      // Use UTC month start so it matches what the DB stores via date_trunc('month', NOW())
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const [usageRes, { data: boosts }, { data: landings }, { data: agents }] = await Promise.all([
        supabase
          .from("usage_counters")
          .select("ai_analyses_used, automated_messages_used, email_sends_used, ai_agent_conversations_used")
          .eq("organization_id", organizationId)
          .eq("period_start", monthStart)
          .maybeSingle(),
        supabase
          .from("ai_boost_credits")
          .select("credits_remaining")
          .eq("organization_id", organizationId),
        supabase
          .from("ia_landings_credits")
          .select("credits_remaining")
          .eq("organization_id", organizationId),
        supabase
          .from("ia_agent_credits")
          .select("credits_remaining")
          .eq("organization_id", organizationId),
      ]);

      // IMPORTANT: If the usage query errors (e.g. a missing column after a migration),
      // we must NOT fall back to zeros — that would hide real usage data from users.
      // Instead we show an explicit error so the issue is immediately visible.
      if (usageRes.error) {
        console.error("usage_counters query failed:", usageRes.error.message);
        setUsageError(usageRes.error.message);
        setUsage(null);
      } else {
        // null means no row yet this month → user hasn't consumed anything, true zero
        setUsage(usageRes.data ?? { ai_analyses_used: 0, automated_messages_used: 0, email_sends_used: 0, ai_agent_conversations_used: 0 });
      }

      setBoostCredits((boosts ?? []).reduce((a: number, r) => a + (r.credits_remaining ?? 0), 0));
      setLandingCredits((landings ?? []).reduce((a: number, r) => a + (r.credits_remaining ?? 0), 0));
      setAgentCredits((agents ?? []).reduce((a: number, r) => a + (r.credits_remaining ?? 0), 0));

      // Load landing usage log (last 30 entries)
      supabase
        .from("ia_landings_usage_log")
        .select("created_at, call_type, tokens_total, tokens_input, tokens_output")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(30)
        .then(({ data }) => setLandingUsageLog(data ?? []));
      setUsageLoading(false);
    })();
  }, [organizationId]);

  async function buyBoost(price_id: string, label: string) {
    setPurchasingBoost(price_id);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-create-checkout-session", {
        body: { mode: "payment", price_id, success_path: "/billing", cancel_path: "/billing", organization_id: organizationId },
      });
      if (error || !data?.url) {
        toast.error(`No se pudo iniciar el pago de ${label}`);
        return;
      }
      window.location.href = data.url;
    } finally {
      setPurchasingBoost(null);
    }
  }

  async function openCustomerPortal() {
    setOpeningPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-customer-portal", { body: {} });
      if (error || !data?.url) {
        toast.error("No se pudo abrir el portal de facturación. Intenta de nuevo.");
        return;
      }
      window.location.href = data.url;
    } finally {
      setOpeningPortal(false);
    }
  }

  if (subLoading || !subscription) {
    return (
      <AppLayout>
        <AppHeader title="Facturación" />
        <div className="p-6 text-muted-foreground">Cargando información del plan...</div>
      </AppLayout>
    );
  }

  // ── Helper: status badge ─────────────────────────────────────────────────────
  const StatusBadge = () => {
    if (subscription.status === "trialing_internal")
      return <Badge variant="secondary" className="text-xs">Prueba gratis</Badge>;
    if (subscription.status === "active")
      return <Badge className="bg-green-600 hover:bg-green-600 text-white text-xs">Activo</Badge>;
    if (subscription.status === "past_due")
      return <Badge variant="destructive" className="text-xs">Pago pendiente</Badge>;
    if (subscription.status === "canceled")
      return <Badge variant="outline" className="text-xs">Cancelado</Badge>;
    return null;
  };

  const usageItems = [
    {
      label: "Análisis IA",
      used: usage?.ai_analyses_used ?? 0,
      limit: subscription.monthlyAiAnalyses,
      extra: boostCredits,
      icon: Sparkles,
      color: "text-amber-500",
      show: true,
    },
    {
      label: "Msgs automatizados",
      used: usage?.automated_messages_used ?? 0,
      limit: subscription.monthlyAutomatedMessages,
      icon: Zap,
      color: "text-blue-500",
      show: true,
    },
    {
      label: "Email Campaigns",
      used: usage?.email_sends_used ?? 0,
      limit: subscription.monthlyEmailSends,
      icon: TrendingUp,
      color: "text-indigo-500",
      show: subscription.featureEmailCampaigns,
    },
    {
      label: "Agente IA",
      used: usage?.ai_agent_conversations_used ?? 0,
      limit: subscription.monthlyAiAgentConversations,
      icon: Bot,
      color: "text-violet-500",
      show: subscription.featureAiAgent,
    },
  ].filter((i) => i.show);

  return (
    <AppLayout>
      <AppHeader title="Facturación" />
      <div className="p-4 md:p-6 space-y-6">

        {/* ── Plan card ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border bg-card px-5 py-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold">Plan actual:</span>
              <span className="text-base font-bold text-primary">{subscription.planName}</span>
              <StatusBadge />
            </div>
            {subscription.status === "trialing_internal" && daysLeftInTrial !== null && (
              <p className="text-sm text-muted-foreground">
                {daysLeftInTrial > 0
                  ? `Tu prueba termina en ${daysLeftInTrial} días. Elige un plan para no perder el acceso.`
                  : "Tu prueba termina hoy."}
              </p>
            )}
            {subscription.status === "active" && subscription.currentPeriodEnd && (
              <p className="text-sm text-muted-foreground">
                {subscription.cancelAtPeriodEnd ? "Cancela el" : "Próxima renovación"}:{" "}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString("es-CO", { dateStyle: "long" })}
              </p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            {subscription.planId !== "business" && (
              <Button size="sm" variant="outline" asChild>
                <Link to="/pricing">Cambiar plan</Link>
              </Button>
            )}
            {(subscription.status === "active" || subscription.status === "past_due") && (
              <Button size="sm" onClick={openCustomerPortal} disabled={openingPortal}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                {openingPortal ? "Abriendo..." : "Administrar"}
              </Button>
            )}
            {subscription.status === "trialing_internal" && (
              <Button size="sm" asChild>
                <Link to="/pricing">Elegir plan</Link>
              </Button>
            )}
          </div>
        </div>

        {/* ── Uso del mes — grid de métricas ─────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Uso este mes
          </h2>
          {usageLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
          ) : usageError ? (
            <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
              <p className="font-semibold">No se pudieron cargar los datos de uso.</p>
              <p className="text-xs mt-0.5 text-red-500 dark:text-red-500 font-mono">{usageError}</p>
              <p className="text-xs mt-1 text-red-600 dark:text-red-400">Contacta a soporte — tus datos no se han perdido.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {usageItems.map((item) => {
                const isUnlimited = item.limit === null;
                const total = isUnlimited ? null : (item.limit! + (item.extra ?? 0));
                const pct = total ? Math.min(100, Math.round((item.used / total) * 100)) : 0;
                const isDanger = !isUnlimited && pct >= 90;
                const isWarn   = !isUnlimited && pct >= 70 && !isDanger;
                return (
                  <div key={item.label}
                    className={`rounded-xl border bg-card p-4 flex flex-col gap-3 ${isDanger ? "border-red-300 dark:border-red-800" : ""}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground font-medium">{item.label}</span>
                      <item.icon className={`h-3.5 w-3.5 ${item.color}`} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold leading-none tabular-nums">
                        {item.used.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isUnlimited
                          ? "ilimitado"
                          : `de ${total!.toLocaleString()}`
                        }
                        {item.extra && item.extra > 0 && !isUnlimited
                          ? ` (+${item.extra.toLocaleString()} boost)`
                          : ""}
                      </p>
                    </div>
                    {!isUnlimited ? (
                      <Progress
                        value={pct}
                        className={`h-1.5 ${isDanger ? "[&>div]:bg-red-500" : isWarn ? "[&>div]:bg-amber-500" : ""}`}
                      />
                    ) : (
                      <p className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Sin límite
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Paquetes de créditos adicionales ──────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Créditos adicionales
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

            {/* IA Boost */}
            <PackCard
              icon={<Sparkles className="h-4 w-4 text-amber-500" />}
              title="IA Boost — Análisis de leads"
              creditsLabel={boostCredits > 0 ? `${boostCredits.toLocaleString()} créditos disponibles` : null}
              emptyText="Añade créditos para analizar más leads con IA cuando se agote el cupo mensual."
              packs={IA_BOOST_PACKS}
              purchasingBoost={purchasingBoost}
              onBuy={buyBoost}
            />

            {/* IA Landings */}
            <PackCard
              icon={<Sparkles className="h-4 w-4 text-orange-500" />}
              title="IA Landings — Páginas de aterrizaje"
              creditsLabel={landingCredits > 0 ? `${landingCredits.toLocaleString()} tokens disponibles` : null}
              emptyText="Cada generación y refinamiento descuenta los tokens reales consumidos por la IA."
              packs={IA_LANDINGS_PACKS}
              purchasingBoost={purchasingBoost}
              onBuy={buyBoost}
            />

            {/* IA Landings — Token usage history */}
            {landingUsageLog.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-orange-500" />
                  Historial de consumo — IA Landings
                </h4>
                <div className="space-y-1">
                  {landingUsageLog.map((entry, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${
                          entry.call_type === "generation"
                            ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        }`}>
                          {entry.call_type === "generation" ? "Generación" : "Edición"}
                        </span>
                        <span className="text-muted-foreground">
                          {new Date(entry.created_at).toLocaleDateString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <span className="font-medium tabular-nums">
                        {entry.tokens_total.toLocaleString()} tokens
                        <span className="text-muted-foreground ml-1 text-[10px]">
                          ({entry.tokens_input.toLocaleString()} in / {entry.tokens_output.toLocaleString()} out)
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">Últimas 30 llamadas</p>
              </div>
            )}

            {/* IA Agent */}
            {subscription.featureAiAgent && (
              <PackCard
                icon={<Bot className="h-4 w-4 text-violet-500" />}
                title="Agente IA — Conversaciones extra"
                creditsLabel={agentCredits > 0 ? `${agentCredits.toLocaleString()} conversaciones disponibles` : null}
                emptyText="Se consumen al agotar el cupo mensual del plan para que el agente siga activo."
                packs={IA_AGENT_PACKS}
                purchasingBoost={purchasingBoost}
                onBuy={buyBoost}
              />
            )}

          </div>
        </section>

      </div>
    </AppLayout>
  );
}

// ── PackCard ──────────────────────────────────────────────────────────────────
function PackCard({
  icon,
  title,
  creditsLabel,
  emptyText,
  packs,
  purchasingBoost,
  onBuy,
}: {
  icon: React.ReactNode;
  title: string;
  creditsLabel: string | null;
  emptyText: string;
  packs: ReadonlyArray<{ key: string; label: string; priceUsd: number; price_id: string }>;
  purchasingBoost: string | null;
  onBuy: (priceId: string, label: string) => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-semibold leading-tight">{title}</span>
      </div>

      {/* Credits balance */}
      {creditsLabel ? (
        <p className="text-xs font-medium text-green-600 flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          {creditsLabel}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground leading-relaxed">{emptyText}</p>
      )}

      {/* Buy buttons */}
      <div className="space-y-1.5 mt-auto">
        {packs.map((pack) => (
          <button
            key={pack.key}
            onClick={() => onBuy(pack.price_id, pack.label)}
            disabled={purchasingBoost === pack.price_id}
            className="w-full flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span>{purchasingBoost === pack.price_id ? "Procesando…" : pack.label}</span>
            <span className="text-muted-foreground font-semibold tabular-nums">${pack.priceUsd}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
