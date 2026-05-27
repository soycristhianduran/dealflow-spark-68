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
import { CreditCard, Sparkles, ExternalLink, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { IA_BOOST_PACKS, IA_LANDINGS_PACKS } from "@/lib/stripe-products";

interface UsageRow {
  ai_analyses_used: number;
  ai_objections_used: number;
  automated_messages_used: number;
  email_sends_used: number;
}

export default function BillingPage() {
  const { subscription, daysLeftInTrial, loading: subLoading, refetch } = useSubscription();
  const { organizationId } = useOrganizationContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [usage, setUsage] = useState<UsageRow | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [boostCredits, setBoostCredits] = useState<number>(0);
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
      const [{ data: u }, { data: boosts }] = await Promise.all([
        (supabase as any)
          .from("usage_counters")
          .select("ai_analyses_used, ai_objections_used, automated_messages_used, email_sends_used")
          .eq("organization_id", organizationId)
          .eq("period_start", monthStart)
          .maybeSingle(),
        (supabase as any)
          .from("ai_boost_credits")
          .select("credits_remaining")
          .eq("organization_id", organizationId),
      ]);
      setUsage(u ?? { ai_analyses_used: 0, ai_objections_used: 0, automated_messages_used: 0, email_sends_used: 0 });
      setBoostCredits((boosts ?? []).reduce((a: number, r: any) => a + (r.credits_remaining ?? 0), 0));
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
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        {/* Current plan card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Plan actual: <span className="text-primary">{subscription.planName}</span>
                {subscription.status === "trialing_internal" && (
                  <Badge variant="secondary">Prueba gratis</Badge>
                )}
                {subscription.status === "active" && (
                  <Badge variant="default" className="bg-green-600 hover:bg-green-600">Activo</Badge>
                )}
                {subscription.status === "past_due" && (
                  <Badge variant="destructive">Pago pendiente</Badge>
                )}
                {subscription.status === "canceled" && (
                  <Badge variant="outline">Cancelado</Badge>
                )}
              </CardTitle>
              {subscription.status === "trialing_internal" && daysLeftInTrial !== null && (
                <p className="text-sm text-muted-foreground mt-1">
                  {daysLeftInTrial > 0
                    ? `Tu prueba termina en ${daysLeftInTrial} días.`
                    : "Tu prueba termina hoy."}
                </p>
              )}
              {subscription.status === "active" && subscription.currentPeriodEnd && (
                <p className="text-sm text-muted-foreground mt-1">
                  {subscription.cancelAtPeriodEnd ? "Termina" : "Próxima renovación"}:{" "}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString("es-CO", {
                    dateStyle: "long",
                  })}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {subscription.status === "active" || subscription.status === "past_due" ? (
                <Button onClick={openCustomerPortal} disabled={openingPortal}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {openingPortal ? "Abriendo..." : "Administrar"}
                </Button>
              ) : (
                <Button asChild>
                  <Link to="/pricing">Elegir un plan</Link>
                </Button>
              )}
            </div>
          </CardHeader>
        </Card>

        {/* Usage card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Uso de este mes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {usageLoading ? (
              <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
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
                  label="Detección de objeciones IA"
                  used={usage?.ai_objections_used ?? 0}
                  limit={subscription.monthlyAiObjections}
                />
                <UsageBar
                  label="Mensajes automatizados"
                  used={usage?.automated_messages_used ?? 0}
                  limit={subscription.monthlyAutomatedMessages}
                />
                {subscription.featureEmailCampaigns && (
                  <UsageBar
                    label="Envíos de Email Campaigns"
                    used={usage?.email_sends_used ?? 0}
                    limit={subscription.monthlyEmailSends}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* AI Boost credits */}
        {boostCredits > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500" />
                AI Boost créditos disponibles
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{boostCredits.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Estos créditos se consumen automáticamente cuando se acaba el cupo mensual de tu plan.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Upgrade prompt or AI Boost CTA */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {subscription.planId === "business" ? "Comprar más créditos IA" : "¿Necesitas más?"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {subscription.planId !== "business" && (
              <p className="text-sm text-muted-foreground mb-3">
                Si llegas al límite del plan, puedes upgradear o comprar un paquete de AI Boost.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/pricing">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Ver planes
                </Link>
              </Button>
              {IA_BOOST_PACKS.map((pack) => (
                <Button
                  key={pack.key}
                  variant="outline"
                  onClick={() => buyBoost(pack.price_id, pack.label)}
                  disabled={purchasingBoost === pack.price_id}
                >
                  <Sparkles className="h-4 w-4 mr-2 text-amber-500" />
                  {purchasingBoost === pack.price_id ? "Procesando..." : `${pack.label} — $${pack.priceUsd}`}
                </Button>
              ))}
              {IA_LANDINGS_PACKS.map((pack) => (
                <Button
                  key={pack.key}
                  variant="outline"
                  onClick={() => buyBoost(pack.price_id, pack.label)}
                  disabled={purchasingBoost === pack.price_id}
                >
                  <Sparkles className="h-4 w-4 mr-2 text-orange-500" />
                  {purchasingBoost === pack.price_id ? "Procesando..." : `${pack.label} — $${pack.priceUsd}`}
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
