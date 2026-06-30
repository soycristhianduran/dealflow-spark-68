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
import { useTranslation } from "react-i18next";
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
import { IA_BOOST_PACKS, IA_LANDINGS_PACKS, IA_AGENT_PACKS, IA_ASSISTANT_PACKS } from "@/lib/stripe-products";

interface UsageRow {
  ai_analyses_used: number;
  automated_messages_used: number;
  email_sends_used: number;
  ai_agent_conversations_used: number;
  ai_agent_credits_used: number;
  ai_assistant_used: number;
}

export default function BillingPage() {
  const { t } = useTranslation();
  const { subscription, daysLeftInTrial, loading: subLoading, refetch } = useSubscription();
  const { organizationId } = useOrganizationContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [usage, setUsage] = useState<UsageRow | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [boostCredits, setBoostCredits] = useState<number>(0);
  const [landingCredits, setLandingCredits] = useState<number>(0);
  const [agentCredits, setAgentCredits] = useState<number>(0);
  const [assistantCredits, setAssistantCredits] = useState<number>(0);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [purchasingBoost, setPurchasingBoost] = useState<string | null>(null);
  const [addonCatalog, setAddonCatalog] = useState<Array<{
    key: string; name: string; kind: string; unit_label: string; units_per_pack: number; monthly_price_usd: number; stripe_price_id: string | null;
  }>>([]);
  const [orgAddons, setOrgAddons] = useState<{ extra_seats: number; extra_contacts: number }>({ extra_seats: 0, extra_contacts: 0 });
  const [purchasingAddon, setPurchasingAddon] = useState<string | null>(null);

  // Show toast on checkout return (run once on mount)
  useEffect(() => {
    const checkoutStatus = searchParams.get("checkout_status");
    if (checkoutStatus === "success" && !sessionStorage.getItem("billing_toast_shown")) {
      sessionStorage.setItem("billing_toast_shown", "1");
      toast.success(t("billingPage.paymentSuccess"));
      refetch();
      const next = new URLSearchParams(searchParams);
      next.delete("checkout_status");
      setSearchParams(next, { replace: true });
    } else if (checkoutStatus === "canceled" && !sessionStorage.getItem("billing_toast_shown")) {
      sessionStorage.setItem("billing_toast_shown", "1");
      toast.info(t("billingPage.paymentCanceled"));
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
      const [usageRes, { data: boosts }, { data: landings }, { data: agents }, { data: assistants }] = await Promise.all([
        supabase
          .from("usage_counters")
          .select("ai_analyses_used, automated_messages_used, email_sends_used, ai_agent_conversations_used, ai_agent_credits_used, ai_assistant_used")
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
        supabase
          .from("ai_assistant_credits")
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
        setUsage(usageRes.data ?? { ai_analyses_used: 0, automated_messages_used: 0, email_sends_used: 0, ai_agent_conversations_used: 0, ai_agent_credits_used: 0, ai_assistant_used: 0 });
      }

      setBoostCredits((boosts ?? []).reduce((a: number, r) => a + (r.credits_remaining ?? 0), 0));
      setLandingCredits((landings ?? []).reduce((a: number, r) => a + (r.credits_remaining ?? 0), 0));
      setAgentCredits((agents ?? []).reduce((a: number, r) => a + (r.credits_remaining ?? 0), 0));
      setAssistantCredits((assistants ?? []).reduce((a: number, r: any) => a + (r.credits_remaining ?? 0), 0));

      // Capacity add-ons: catalog (sellable) + current purchased extras for this org.
      supabase
        .from("addon_catalog")
        .select("key, name, kind, unit_label, units_per_pack, monthly_price_usd, stripe_price_id")
        .eq("active", true)
        .order("display_order")
        .then(({ data }) => setAddonCatalog(data ?? []));
      supabase
        .from("org_addons")
        .select("extra_seats, extra_contacts")
        .eq("organization_id", organizationId)
        .maybeSingle()
        .then(({ data }) => setOrgAddons(data ?? { extra_seats: 0, extra_contacts: 0 }));

      setUsageLoading(false);
    })();
  }, [organizationId]);

  async function buyAddon(price_id: string | null, key: string, label: string) {
    if (!price_id) { toast.error(t("billingPage.addonNotAvailable")); return; }
    setPurchasingAddon(key);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-create-checkout-session", {
        body: { mode: "subscription", price_id, addon_kind: key, quantity: 1, success_path: "/billing", cancel_path: "/billing", organization_id: organizationId },
      });
      if (error || !data?.url) {
        toast.error(t("billingPage.addonPurchaseFailed", { label }));
        return;
      }
      window.location.href = data.url;
    } finally {
      setPurchasingAddon(null);
    }
  }

  async function buyBoost(price_id: string, label: string) {
    setPurchasingBoost(price_id);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-create-checkout-session", {
        body: { mode: "payment", price_id, success_path: "/billing", cancel_path: "/billing", organization_id: organizationId },
      });
      if (error || !data?.url) {
        toast.error(t("billingPage.boostPaymentFailed", { label }));
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
        toast.error(t("billingPage.portalFailed"));
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
        <AppHeader title={t("billingPage.billing")} />
        <div className="p-6 text-muted-foreground">{t("billingPage.loadingPlan")}</div>
      </AppLayout>
    );
  }

  // ── Helper: status badge ─────────────────────────────────────────────────────
  const StatusBadge = () => {
    if (subscription.status === "trialing_internal")
      return <Badge variant="secondary" className="text-xs">{t("billingPage.statusFreeTrial")}</Badge>;
    if (subscription.status === "active")
      return <Badge className="bg-green-600 hover:bg-green-600 text-white text-xs">{t("billingPage.statusActive")}</Badge>;
    if (subscription.status === "past_due")
      return <Badge variant="destructive" className="text-xs">{t("billingPage.statusPastDue")}</Badge>;
    if (subscription.status === "canceled")
      return <Badge variant="outline" className="text-xs">{t("billingPage.statusCanceled")}</Badge>;
    return null;
  };

  const usageItems = [
    {
      label: t("billingPage.usageAiAnalyses"),
      used: usage?.ai_analyses_used ?? 0,
      limit: subscription.monthlyAiAnalyses,
      extra: boostCredits,
      icon: Sparkles,
      color: "text-amber-500",
      show: true,
    },
    {
      label: t("billingPage.usageAutomatedMessages"),
      used: usage?.automated_messages_used ?? 0,
      limit: subscription.monthlyAutomatedMessages,
      icon: Zap,
      color: "text-blue-500",
      show: true,
    },
    {
      label: t("billingPage.usageEmailCampaigns"),
      used: usage?.email_sends_used ?? 0,
      limit: subscription.monthlyEmailSends,
      icon: TrendingUp,
      color: "text-indigo-500",
      show: subscription.featureEmailCampaigns,
    },
    {
      label: t("billingPage.usageChatAgentCredits"),
      used: usage?.ai_agent_credits_used ?? 0,
      limit: subscription.monthlyAiAgentCredits,
      icon: Bot,
      color: "text-violet-500",
      show: subscription.featureAiAgent,
    },
    {
      label: t("billingPage.usageAiAssistant"),
      used: usage?.ai_assistant_used ?? 0,
      limit: subscription.monthlyAiAssistant,
      icon: Sparkles,
      color: "text-primary",
      show: true,
    },
  ].filter((i) => i.show);

  return (
    <AppLayout>
      <AppHeader title={t("billingPage.billing")} />
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">

        {/* ── Plan card ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border bg-card px-5 py-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold">{t("billingPage.currentPlan")}</span>
              <span className="text-base font-bold text-primary">{subscription.planName}</span>
              <StatusBadge />
            </div>
            {subscription.status === "trialing_internal" && daysLeftInTrial !== null && (
              <p className="text-sm text-muted-foreground">
                {daysLeftInTrial > 0
                  ? t("billingPage.trialEndsInDays", { days: daysLeftInTrial })
                  : t("billingPage.trialEndsToday")}
              </p>
            )}
            {subscription.status === "active" && subscription.currentPeriodEnd && (
              <p className="text-sm text-muted-foreground">
                {subscription.cancelAtPeriodEnd ? t("billingPage.cancelsOn") : t("billingPage.nextRenewal")}:{" "}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString("es-CO", { dateStyle: "long" })}
              </p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            {subscription.planId !== "agency" && (
              <Button size="sm" variant="outline" asChild>
                <Link to="/pricing">{t("billingPage.changePlan")}</Link>
              </Button>
            )}
            {(subscription.status === "active" || subscription.status === "past_due") && (
              <Button size="sm" onClick={openCustomerPortal} disabled={openingPortal}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                {openingPortal ? t("billingPage.opening") : t("billingPage.manage")}
              </Button>
            )}
            {subscription.status === "trialing_internal" && (
              <Button size="sm" asChild>
                <Link to="/pricing">{t("billingPage.choosePlan")}</Link>
              </Button>
            )}
          </div>
        </div>

        {/* ── Uso del mes — grid de métricas ─────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            {t("billingPage.usageThisMonth")}
          </h2>
          {usageLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("billingPage.loading")}
            </div>
          ) : usageError ? (
            <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
              <p className="font-semibold">{t("billingPage.usageLoadError")}</p>
              <p className="text-xs mt-0.5 text-red-500 dark:text-red-500 font-mono">{usageError}</p>
              <p className="text-xs mt-1 text-red-600 dark:text-red-400">{t("billingPage.contactSupport")}</p>
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
                          ? t("billingPage.unlimited")
                          : t("billingPage.ofTotal", { total: total!.toLocaleString() })
                        }
                        {item.extra && item.extra > 0 && !isUnlimited
                          ? t("billingPage.boostExtra", { extra: item.extra.toLocaleString() })
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
                        <CheckCircle2 className="h-3 w-3" /> {t("billingPage.noLimit")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Complementos de capacidad (asientos / contactos) ──────────────── */}
        {addonCatalog.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              {t("billingPage.expandCapacity")}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {addonCatalog.map((a) => {
                const current = a.kind === "extra_seats" ? orgAddons.extra_seats : orgAddons.extra_contacts;
                const isSeats = a.kind === "extra_seats";
                return (
                  <div key={a.key} className="rounded-xl border border-border bg-card p-4 flex flex-col">
                    <div className="flex items-center gap-2 mb-1">
                      {isSeats
                        ? <Bot className="h-4 w-4 text-sky-500" />
                        : <TrendingUp className="h-4 w-4 text-emerald-500" />}
                      <h4 className="text-sm font-semibold">{a.name}</h4>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      {isSeats
                        ? t("billingPage.seatsDescription")
                        : t("billingPage.contactsDescription")}
                    </p>
                    <div className="mt-auto flex items-end justify-between">
                      <div>
                        <div className="text-xl font-bold">
                          ${a.monthly_price_usd}
                          <span className="text-xs font-normal text-muted-foreground"> {t("billingPage.perMonth")} · {a.unit_label}</span>
                        </div>
                        {current > 0 && (
                          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                            {isSeats
                              ? t("billingPage.activeUsers", { count: current.toLocaleString() })
                              : t("billingPage.activeContacts", { count: current.toLocaleString() })}
                          </div>
                        )}
                      </div>
                      <Button size="sm" disabled={purchasingAddon === a.key} onClick={() => buyAddon(a.stripe_price_id, a.key, a.name)}>
                        {purchasingAddon === a.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (current > 0 ? t("billingPage.addMore") : t("billingPage.buy"))}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              {t("billingPage.addonManageHint")}
            </p>
          </section>
        )}

        {/* ── Paquetes de créditos adicionales ──────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            {t("billingPage.additionalCredits")}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

            {/* IA Boost */}
            <PackCard
              icon={<Sparkles className="h-4 w-4 text-amber-500" />}
              title={t("billingPage.boostTitle")}
              creditsLabel={boostCredits > 0 ? t("billingPage.creditsAvailable", { count: boostCredits.toLocaleString() }) : null}
              emptyText={t("billingPage.boostEmpty")}
              packs={IA_BOOST_PACKS}
              purchasingBoost={purchasingBoost}
              onBuy={buyBoost}
            />

            {/* IA Landings */}
            <PackCard
              icon={<Sparkles className="h-4 w-4 text-orange-500" />}
              title={t("billingPage.landingsTitle")}
              creditsLabel={landingCredits > 0 ? t("billingPage.creditsAvailable", { count: Math.floor(landingCredits / 1000).toLocaleString() }) : null}
              emptyText={t("billingPage.landingsEmpty")}
              packs={IA_LANDINGS_PACKS}
              purchasingBoost={purchasingBoost}
              onBuy={buyBoost}
            />

            {/* IA Agent */}
            {subscription.featureAiAgent && (
              <PackCard
                icon={<Bot className="h-4 w-4 text-violet-500" />}
                title={t("billingPage.agentTitle")}
                creditsLabel={agentCredits > 0 ? t("billingPage.creditsAvailable", { count: agentCredits.toLocaleString() }) : null}
                emptyText={t("billingPage.agentEmpty")}
                packs={IA_AGENT_PACKS}
                purchasingBoost={purchasingBoost}
                onBuy={buyBoost}
              />
            )}

            {/* Asistente IA — extra assistances */}
            <PackCard
              icon={<Sparkles className="h-4 w-4 text-orange-500" />}
              title="Asistente IA — Asistencias extra"
              creditsLabel={assistantCredits > 0 ? `${assistantCredits.toLocaleString()} asistencias disponibles` : null}
              emptyText="Se consumen al agotar el cupo mensual del plan (1 asistencia por consulta)."
              packs={IA_ASSISTANT_PACKS}
              purchasingBoost={purchasingBoost}
              onBuy={buyBoost}
            />

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
  const { t } = useTranslation();
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
            <span>{purchasingBoost === pack.price_id ? t("billingPage.processing") : pack.label}</span>
            <span className="text-muted-foreground font-semibold tabular-nums">${pack.priceUsd}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
