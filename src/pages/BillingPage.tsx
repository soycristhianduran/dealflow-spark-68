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
import { CreditCard, Sparkles, ExternalLink, CheckCircle2, Loader2, Bot } from "lucide-react";
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

  // Load usage counters + boost credits
  useEffect(() => {
    if (!organizationId) return;
    setUsageLoading(true);
    (async () => {
      // Use UTC month start so it matches what the DB stores via date_trunc('month', NOW())
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const [{ data: u }, { data: boosts }, { data: landings }, { data: agents }] = await Promise.all([
        (supabase as any)
          .from("usage_counters")
          .select("ai_analyses_used, automated_messages_used, email_sends_used, ai_agent_conversations_used")
          .eq("organization_id", organizationId)
          .eq("period_start", monthStart)
          .maybeSingle(),
        (supabase as any)
          .from("ai_boost_credits")
          .select("credits_remaining")
          .eq("organization_id", organizationId),
        (supabase as any)
          .from("ia_landings_credits")
          .select("credits_remaining")
          .eq("organization_id", organizationId),
        (supabase as any)
          .from("ia_agent_credits")
          .select("credits_remaining")
          .eq("organization_id", organizationId),
      ]);
      setUsage(u ?? { ai_analyses_used: 0, automated_messages_used: 0, email_sends_used: 0, ai_agent_conversations_used: 0 });
      setBoostCredits((boosts ?? []).reduce((a: number, r: any) => a + (r.credits_remaining ?? 0), 0));
      setLandingCredits((landings ?? []).reduce((a: number, r: any) => a + (r.credits_remaining ?? 0), 0));
      setAgentCredits((agents ?? []).reduce((a: number, r: any) => a + (r.credits_remaining ?? 0), 0));
      setUsageLoading(false);
    })();
  }, [organizationId]);

  async function buyBoost(price_id: string, label: string) {
    setPurchasingBoost(price_id);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-create-checkout-session", {
        body: { mode: "payment", price_id, success_path: "/billing", cancel_path: "/billing" },
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

  return (
    <AppLayout>
      <AppHeader title="Facturación" />
      <div className="p-4 md:p-6 space-y-5 max-w-2xl">

        {/* ── Plan actual ─────────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold text-foreground">Plan actual:</span>
                  <span className="text-base font-semibold text-primary">{subscription.planName}</span>
                  {subscription.status === "trialing_internal" && (
                    <Badge variant="secondary">Prueba gratis</Badge>
                  )}
                  {subscription.status === "active" && (
                    <Badge className="bg-green-600 hover:bg-green-600 text-white">Activo</Badge>
                  )}
                  {subscription.status === "past_due" && (
                    <Badge variant="destructive">Pago pendiente</Badge>
                  )}
                  {subscription.status === "canceled" && (
                    <Badge variant="outline">Cancelado</Badge>
                  )}
                </div>
                {subscription.status === "trialing_internal" && daysLeftInTrial !== null && (
                  <p className="text-sm text-muted-foreground">
                    {daysLeftInTrial > 0
                      ? `Tu prueba termina en ${daysLeftInTrial} días.`
                      : "Tu prueba termina hoy."}
                  </p>
                )}
                {subscription.status === "active" && subscription.currentPeriodEnd && (
                  <p className="text-sm text-muted-foreground">
                    {subscription.cancelAtPeriodEnd ? "Termina" : "Próxima renovación"}:{" "}
                    {new Date(subscription.currentPeriodEnd).toLocaleDateString("es-CO", {
                      dateStyle: "long",
                    })}
                  </p>
                )}
              </div>
              <div className="shrink-0">
                {subscription.status === "active" || subscription.status === "past_due" ? (
                  <Button size="sm" onClick={openCustomerPortal} disabled={openingPortal}>
                    <ExternalLink className="h-4 w-4 mr-1.5" />
                    {openingPortal ? "Abriendo..." : "Administrar"}
                  </Button>
                ) : (
                  <Button size="sm" asChild>
                    <Link to="/pricing">Elegir un plan</Link>
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Uso de este mes ─────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Uso de este mes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {usageLoading ? (
              <div className="flex items-center gap-2 py-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando uso…
              </div>
            ) : (
              <>
                <UsageBar
                  label="Análisis IA de leads"
                  used={usage?.ai_analyses_used ?? 0}
                  limit={subscription.monthlyAiAnalyses}
                  boostExtra={boostCredits}
                />
                <UsageBar
                  label="Mensajes automatizados"
                  used={usage?.automated_messages_used ?? 0}
                  limit={subscription.monthlyAutomatedMessages}
                />
                {subscription.featureEmailCampaigns && (
                  <UsageBar
                    label="Email Campaigns"
                    used={usage?.email_sends_used ?? 0}
                    limit={subscription.monthlyEmailSends}
                  />
                )}
                {subscription.featureAiAgent && (
                  <UsageBar
                    label="Conversaciones Agente IA"
                    used={usage?.ai_agent_conversations_used ?? 0}
                    limit={subscription.monthlyAiAgentConversations}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ── AI Boost créditos (solo si hay) ─────────────────────── */}
        {boostCredits > 0 && (
          <Card>
            <CardContent className="pt-5 pb-5 flex items-center gap-4">
              <Sparkles className="h-8 w-8 text-amber-500 shrink-0" />
              <div>
                <p className="text-2xl font-bold leading-none">{boostCredits.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  créditos AI Boost disponibles
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Paquetes de créditos ─────────────────────────────────── */}
        {/* Two-column grid on sm+, stacked on mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* IA Landings */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-orange-500" />
                Créditos IA Landings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {usageLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
                </div>
              ) : (
                <>
                  {landingCredits > 0 ? (
                    <div>
                      <p className="text-2xl font-bold leading-none">{landingCredits}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        créditos disponibles
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Sin créditos. Compra un paquete para generar landings con IA.
                    </p>
                  )}
                  <div className="space-y-1.5">
                    {IA_LANDINGS_PACKS.map((pack) => (
                      <Button
                        key={pack.key}
                        size="sm"
                        variant="outline"
                        className="w-full justify-start gap-2 text-xs"
                        onClick={() => buyBoost(pack.price_id, pack.label)}
                        disabled={purchasingBoost === pack.price_id}
                      >
                        <Sparkles className="h-3 w-3 text-orange-500 shrink-0" />
                        <span className="flex-1 text-left truncate">
                          {purchasingBoost === pack.price_id ? "Procesando..." : pack.label}
                        </span>
                        <span className="text-muted-foreground font-medium shrink-0">${pack.priceUsd}</span>
                      </Button>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* IA Agent */}
          {subscription.featureAiAgent && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Bot className="h-4 w-4 text-violet-500" />
                  Conversaciones extra Agente IA
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {usageLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
                  </div>
                ) : (
                  <>
                    {agentCredits > 0 ? (
                      <div>
                        <p className="text-2xl font-bold leading-none">{agentCredits.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          conversaciones adicionales
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Sin conversaciones extra. Compra un paquete para cuando se agote tu cuota mensual.
                      </p>
                    )}
                    <div className="space-y-1.5">
                      {IA_AGENT_PACKS.map((pack) => (
                        <Button
                          key={pack.key}
                          size="sm"
                          variant="outline"
                          className="w-full justify-start gap-2 text-xs"
                          onClick={() => buyBoost(pack.price_id, pack.label)}
                          disabled={purchasingBoost === pack.price_id}
                        >
                          <Bot className="h-3 w-3 text-violet-500 shrink-0" />
                          <span className="flex-1 text-left truncate">
                            {purchasingBoost === pack.price_id ? "Procesando..." : pack.label}
                          </span>
                          <span className="text-muted-foreground font-medium shrink-0">${pack.priceUsd}</span>
                        </Button>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── AI Boost packs + upgrade ────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              {subscription.planId === "business" ? "Más créditos de análisis IA" : "¿Necesitas más capacidad?"}
            </CardTitle>
            {subscription.planId !== "business" && (
              <p className="text-sm text-muted-foreground">
                Cambia de plan o añade créditos de análisis IA a los contactos.
              </p>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {subscription.planId !== "business" && (
                <Button asChild variant="outline" className="justify-start gap-2">
                  <Link to="/pricing">
                    <CreditCard className="h-4 w-4 shrink-0" />
                    <span>Ver todos los planes</span>
                  </Link>
                </Button>
              )}
              {IA_BOOST_PACKS.map((pack) => (
                <Button
                  key={pack.key}
                  variant="outline"
                  className="justify-start gap-2"
                  onClick={() => buyBoost(pack.price_id, pack.label)}
                  disabled={purchasingBoost === pack.price_id}
                >
                  <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
                  <span className="flex-1 text-left truncate">
                    {purchasingBoost === pack.price_id ? "Procesando..." : pack.label}
                  </span>
                  <span className="text-muted-foreground text-sm shrink-0">${pack.priceUsd}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
    </AppLayout>
  );
}

function UsageBar({
  label,
  used,
  limit,
  boostExtra,
}: {
  label: string;
  used: number;
  limit: number | null;  // null = unlimited
  boostExtra?: number;
}) {
  const isUnlimited = limit === null;
  const totalAllowed = isUnlimited ? Infinity : (limit + (boostExtra ?? 0));
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / totalAllowed) * 100));

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {used.toLocaleString()}
          {isUnlimited ? " usados" : ` / ${limit?.toLocaleString()}`}
          {boostExtra && boostExtra > 0 && !isUnlimited
            ? ` (+${boostExtra.toLocaleString()} boost)`
            : ""}
        </span>
      </div>
      {!isUnlimited && (
        <Progress value={pct} className={pct >= 90 ? "[&>div]:bg-red-500" : pct >= 70 ? "[&>div]:bg-amber-500" : ""} />
      )}
      {isUnlimited && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-green-500" />
          Ilimitado
        </p>
      )}
    </div>
  );
}
