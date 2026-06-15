/**
 * Public pricing page — shown at /pricing
 *
 * Two modes:
 *   - Anonymous visitor → "Empezar prueba gratis" → redirects to /auth?signup=true
 *   - Authenticated user → "Cambiar a este plan" → calls stripe-create-checkout-session
 *
 * Plan data is fetched from the `plans` table (SECURITY DEFINER-free SELECT,
 * any user including anon can read).
 */

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Sparkles, ArrowRight } from "lucide-react";
import { KlosifyLogo } from "@/components/icons/KlosifyLogo";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type Plan = {
  id: "starter" | "pro" | "business";
  name: string;
  display_order: number;
  monthly_price_usd: number;
  annual_price_usd: number;
  stripe_price_id_monthly: string | null;
  stripe_price_id_annual: string | null;
  max_users: number | null;
  max_contacts: number | null;
  max_active_deals: number | null;
  monthly_automated_messages: number | null;
  monthly_ai_analyses: number | null;
  monthly_ai_objections: number | null;
  monthly_email_sends: number | null;
  feature_meta_ads: boolean;
  feature_email_campaigns: boolean;
  feature_api_access: boolean;
  feature_priority_support: boolean;
};

const formatLimit = (n: number | null) =>
  n === null ? "Ilimitado" : n.toLocaleString("es-CO");

export default function PricingPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billingInterval, setBillingInterval] = useState<"month" | "year">("month");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .order("display_order");
      if (!error && data) setPlans(data as unknown as Plan[]);
      setLoading(false);
    })();
  }, []);

  async function startCheckout(plan: Plan) {
    if (!session) {
      navigate("/auth?next=/pricing");
      return;
    }

    const priceId = billingInterval === "month"
      ? plan.stripe_price_id_monthly
      : plan.stripe_price_id_annual;

    if (!priceId) {
      toast.error(
        "Este plan aún no está disponible para comprar. Estamos configurando el pago, vuelve en un momento."
      );
      return;
    }

    setSubmitting(plan.id);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-create-checkout-session", {
        body: {
          mode: "subscription",
          price_id: priceId,
          success_path: "/billing",
          cancel_path: "/billing",
        },
      });
      if (error || !data?.url) {
        toast.error("No se pudo iniciar el pago. Intenta de nuevo.");
        return;
      }
      window.location.href = data.url;
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <KlosifyLogo size={28} />
            <span className="font-bold text-base tracking-tight">Klosify <span className="text-primary">CRM</span></span>
          </Link>
          <div className="flex items-center gap-3">
            {session ? (
              <Button asChild variant="outline" size="sm">
                <Link to="/">Ir al dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/auth">Iniciar sesión</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/auth">Empezar gratis →</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      <div className="py-12 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10 space-y-3">
          <h1 className="text-4xl font-bold">Precios simples, sin sorpresas</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Empieza con 7 días gratis del plan Pro. Sin tarjeta de crédito.
            Cancela cuando quieras.
          </p>

          {/* Monthly / Annual toggle */}
          <div className="inline-flex items-center bg-muted rounded-lg p-1 mt-4">
            <button
              onClick={() => setBillingInterval("month")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition ${
                billingInterval === "month" ? "bg-background shadow" : "text-muted-foreground"
              }`}
            >
              Mensual
            </button>
            <button
              onClick={() => setBillingInterval("year")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition ${
                billingInterval === "year" ? "bg-background shadow" : "text-muted-foreground"
              }`}
            >
              Anual <Badge variant="secondary" className="ml-1">2 meses gratis</Badge>
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground">Cargando planes...</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {plans.map((plan) => {
              const price = billingInterval === "month" ? plan.monthly_price_usd : plan.annual_price_usd;
              const monthlyEffective = billingInterval === "year" ? plan.annual_price_usd / 12 : plan.monthly_price_usd;
              const isPro = plan.id === "pro";
              return (
                <Card
                  key={plan.id}
                  className={
                    isPro
                      // Pro: highlighted, lift + glow — theme-adaptive bg so text stays readable
                      ? "relative border-0 shadow-xl lg:scale-105 z-10 ring-2 ring-primary/40 bg-gradient-to-b from-orange-50 to-white dark:from-slate-900 dark:to-slate-950"
                      : "relative border shadow-sm hover:shadow-md transition-shadow"
                  }
                >
                  {isPro && (
                    <>
                      {/* Decorative gradient orb in the top-right corner */}
                      <div
                        aria-hidden
                        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-20 blur-3xl"
                        style={{ backgroundColor: "hsl(24 95% 53%)" }}
                      />
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
                        <div
                          className="rounded-full px-3 py-1 text-xs font-semibold text-white shadow-md"
                          style={{
                            backgroundImage:
                              "linear-gradient(90deg, hsl(24 95% 53%), hsl(351 84% 56%))",
                          }}
                        >
                          ⚡ Más popular
                        </div>
                      </div>
                    </>
                  )}
                  <CardHeader className="relative">
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    <div className="mt-2">
                      <span className={`text-5xl font-bold tracking-tight ${isPro ? "bg-gradient-to-r from-primary to-rose-500 bg-clip-text text-transparent" : ""}`}>
                        ${price.toFixed(0)}
                      </span>
                      <span className="text-muted-foreground ml-1">
                        {billingInterval === "month" ? "/mes" : "/año"}
                      </span>
                      {billingInterval === "year" && (
                        <p className="text-xs text-muted-foreground mt-1">
                          ≈ ${monthlyEffective.toFixed(0)} USD/mes
                        </p>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 relative">
                    <Button
                      className={`w-full ${isPro ? "shadow-md hover:shadow-lg" : ""}`}
                      variant={isPro ? "default" : "outline"}
                      size="lg"
                      onClick={() => startCheckout(plan)}
                      disabled={submitting === plan.id}
                      style={isPro ? {
                        backgroundImage: "linear-gradient(90deg, hsl(24 95% 53%), hsl(351 84% 56%))",
                      } : undefined}
                    >
                      {submitting === plan.id ? (
                        "Procesando..."
                      ) : !session ? (
                        <>Empezar prueba gratis <ArrowRight className="h-4 w-4 ml-1" /></>
                      ) : (
                        "Elegir este plan"
                      )}
                    </Button>

                    <ul className="space-y-2 text-sm pt-2">
                      <FeatureRow ok>
                        {plan.max_users === null ? "Usuarios ilimitados" : `${plan.max_users} usuario${plan.max_users > 1 ? "s" : ""}`}
                      </FeatureRow>
                      <FeatureRow ok>{formatLimit(plan.max_contacts)} contactos</FeatureRow>
                      <FeatureRow ok>{formatLimit(plan.max_active_deals)} deals activos</FeatureRow>
                      <FeatureRow ok>
                        {formatLimit(plan.monthly_automated_messages)} mensajes automatizados/mes
                      </FeatureRow>
                      <FeatureRow ok={plan.monthly_ai_analyses !== null}>
                        <span className="flex items-center gap-1">
                          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                          {plan.monthly_ai_analyses === null
                            ? "Sin IA Boost"
                            : `${formatLimit(plan.monthly_ai_analyses)} análisis IA/mes`}
                        </span>
                      </FeatureRow>
                      <FeatureRow ok={plan.monthly_ai_objections !== null}>
                        <span className="flex items-center gap-1">
                          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                          {plan.monthly_ai_objections === null
                            ? "Sin detección de objeciones"
                            : `${formatLimit(plan.monthly_ai_objections)} detecciones objeción/mes`}
                        </span>
                      </FeatureRow>
                      <FeatureRow ok={plan.feature_email_campaigns}>
                        Email Campaigns
                        {plan.feature_email_campaigns && plan.monthly_email_sends !== null && (
                          <span className="text-muted-foreground"> ({formatLimit(plan.monthly_email_sends)}/mes)</span>
                        )}
                      </FeatureRow>
                      <FeatureRow ok={plan.feature_meta_ads}>Dashboard de Meta Ads</FeatureRow>
                      <FeatureRow ok={plan.feature_api_access}>API access</FeatureRow>
                      <FeatureRow ok={plan.feature_priority_support}>
                        Soporte priority + onboarding 1-on-1
                      </FeatureRow>
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* AI Boost mention */}
        <div className="text-center mt-10 text-sm text-muted-foreground">
          ¿Necesitas más análisis IA?{" "}
          <button
            onClick={() => session ? navigate("/billing") : navigate("/auth")}
            className="underline hover:text-foreground transition-colors"
          >
            IA Boost desde $19
          </button>
          {" "}— compra paquetes adicionales cuando tu plan llegue al límite.
        </div>

        {/* Comparison to competitors */}
        <Card className="mt-10">
          <CardHeader>
            <CardTitle>Compáranos con Kommo, Pipedrive y HubSpot</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2">CRM</th>
                    <th className="py-2">Plan equivalente (3 usuarios)</th>
                    <th className="py-2 text-right">Costo mensual</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b bg-primary/5">
                    <td className="py-2 font-semibold">Klosify CRM Pro</td>
                    <td className="py-2">3 usuarios incluidos + IA nativa</td>
                    <td className="py-2 text-right font-bold text-primary">$59 USD</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">Kommo Advanced</td>
                    <td className="py-2">$25/usuario × 3 (AI extra)</td>
                    <td className="py-2 text-right">$75 USD</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">HubSpot Sales Starter</td>
                    <td className="py-2">$20/usuario × 3 (sin AI)</td>
                    <td className="py-2 text-right">$60 USD</td>
                  </tr>
                  <tr>
                    <td className="py-2">Pipedrive Professional</td>
                    <td className="py-2">$39/usuario × 3 (sin WhatsApp)</td>
                    <td className="py-2 text-right">$117 USD</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Precios públicos de cada competidor al momento de publicar esta página. Con WhatsApp + IA nativa incluidos, igualas o superas su funcionalidad por menos: hasta $58 USD/mes de ahorro frente a Pipedrive.
            </p>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}

function FeatureRow({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
      ) : (
        <span className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground">—</span>
      )}
      <span className={ok ? "" : "text-muted-foreground"}>{children}</span>
    </li>
  );
}
