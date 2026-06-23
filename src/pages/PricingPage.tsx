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
import { useTranslation } from "react-i18next";

type Plan = {
  id: "starter" | "pro" | "business" | "agency";
  name: string;
  display_order: number;
  monthly_price_usd: number;
  annual_price_usd: number;
  stripe_price_id_monthly: string | null;
  stripe_price_id_annual: string | null;
  max_users: number | null;
  max_contacts: number | null;
  max_active_deals: number | null;
  max_wa_accounts: number | null;
  max_ig_accounts: number | null;
  max_fb_accounts: number | null;
  max_published_landings: number | null;
  max_automation_flows: number | null;
  monthly_ai_analyses: number | null;
  monthly_ai_objections: number | null;
  monthly_ai_assistant: number | null;
  monthly_ai_agent_credits: number | null;
  monthly_email_sends: number | null;
  feature_meta_ads: boolean;
  feature_email_campaigns: boolean;
  feature_ig_automations: boolean;
  feature_ai_agent: boolean;
  feature_api_access: boolean;
  feature_priority_support: boolean;
};

const formatLimit = (n: number | null, unlimitedLabel: string) =>
  n === null ? unlimitedLabel : n.toLocaleString("es-CO");

export default function PricingPage() {
  const { t } = useTranslation();
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
        .neq("id", "agency")
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
      toast.error(t("pricingPage.planNotAvailable"));
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
        toast.error(t("pricingPage.checkoutFailed"));
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
                <Link to="/">{t("pricingPage.goToDashboard")}</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/auth">{t("pricingPage.login")}</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/auth">{t("pricingPage.startFree")}</Link>
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
          <h1 className="text-4xl font-bold">{t("pricingPage.heading")}</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t("pricingPage.subheading")}
          </p>

          {/* Monthly / Annual toggle */}
          <div className="inline-flex items-center bg-muted rounded-lg p-1 mt-4">
            <button
              onClick={() => setBillingInterval("month")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition ${
                billingInterval === "month" ? "bg-background shadow" : "text-muted-foreground"
              }`}
            >
              {t("pricingPage.monthly")}
            </button>
            <button
              onClick={() => setBillingInterval("year")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition ${
                billingInterval === "year" ? "bg-background shadow" : "text-muted-foreground"
              }`}
            >
              {t("pricingPage.annual")} <Badge variant="secondary" className="ml-1">{t("pricingPage.twoMonthsFree")}</Badge>
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground">{t("pricingPage.loadingPlans")}</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
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
                          {t("pricingPage.mostPopular")}
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
                        {billingInterval === "month" ? t("pricingPage.perMonth") : t("pricingPage.perYear")}
                      </span>
                      {billingInterval === "year" && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("pricingPage.approxMonthly", { amount: monthlyEffective.toFixed(0) })}
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
                        t("pricingPage.processing")
                      ) : !session ? (
                        <>{t("pricingPage.startFreeTrial")} <ArrowRight className="h-4 w-4 ml-1" /></>
                      ) : (
                        t("pricingPage.choosePlan")
                      )}
                    </Button>

                    <ul className="space-y-2 text-sm pt-2">
                      <FeatureRow ok>
                        {plan.max_users === null ? t("pricingPage.unlimitedUsers") : t("pricingPage.usersCount", { count: plan.max_users })}
                      </FeatureRow>
                      <FeatureRow ok>{t("pricingPage.contactsLine", { count: formatLimit(plan.max_contacts, t("pricingPage.unlimited")) })}</FeatureRow>
                      <FeatureRow ok>{t("pricingPage.activeDealsLine", { count: formatLimit(plan.max_active_deals, t("pricingPage.unlimited")) })}</FeatureRow>
                      <FeatureRow ok>
                        {plan.max_wa_accounts === null
                          ? t("pricingPage.unlimitedChannelAccounts")
                          : t("pricingPage.channelAccountsCount", { count: plan.max_wa_accounts })}
                      </FeatureRow>
                      <FeatureRow ok>{t("pricingPage.landingPagesLine", { count: formatLimit(plan.max_published_landings, t("pricingPage.unlimited")) })}</FeatureRow>
                      <FeatureRow ok>{t("pricingPage.automationFlowsLine", { count: formatLimit(plan.max_automation_flows, t("pricingPage.unlimited")) })}</FeatureRow>
                      <FeatureRow ok>
                        {t("pricingPage.unlimitedWhatsapp")} <span className="text-muted-foreground">{t("pricingPage.unlimitedWhatsappNote")}</span>
                      </FeatureRow>

                      <FeatureRow ok={plan.feature_email_campaigns}>
                        {t("pricingPage.emailMarketing")}
                        {plan.feature_email_campaigns && plan.monthly_email_sends !== null && (
                          <span className="text-muted-foreground"> {t("pricingPage.emailsPerMonth", { count: formatLimit(plan.monthly_email_sends, t("pricingPage.unlimited")) })}</span>
                        )}
                      </FeatureRow>

                      <FeatureRow ok={plan.feature_ai_agent}>
                        <span className="flex items-center gap-1">
                          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                          {plan.monthly_ai_agent_credits === null
                            ? t("pricingPage.aiChatAgent")
                            : t("pricingPage.aiChatAgentCredits", { count: formatLimit(plan.monthly_ai_agent_credits, t("pricingPage.unlimited")) })}
                        </span>
                      </FeatureRow>
                      <FeatureRow ok={plan.monthly_ai_assistant !== null}>
                        <span className="flex items-center gap-1">
                          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                          {plan.monthly_ai_assistant === null
                            ? t("pricingPage.noAiAssistant")
                            : t("pricingPage.aiAssistantUses", { count: formatLimit(plan.monthly_ai_assistant, t("pricingPage.unlimited")) })}
                        </span>
                      </FeatureRow>
                      <FeatureRow ok={plan.monthly_ai_analyses !== null}>
                        <span className="flex items-center gap-1">
                          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                          {plan.monthly_ai_analyses === null
                            ? t("pricingPage.aiAnalysisWithBoost")
                            : t("pricingPage.aiContactAnalyses", { count: formatLimit(plan.monthly_ai_analyses, t("pricingPage.unlimited")) })}
                        </span>
                      </FeatureRow>
                      <FeatureRow ok={plan.monthly_ai_objections !== null}>
                        <span className="flex items-center gap-1">
                          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                          {plan.monthly_ai_objections === null
                            ? t("pricingPage.objectionDetectionWithBoost")
                            : t("pricingPage.objectionDetections", { count: formatLimit(plan.monthly_ai_objections, t("pricingPage.unlimited")) })}
                        </span>
                      </FeatureRow>

                      <FeatureRow ok={plan.feature_ig_automations}>{t("pricingPage.instagramAutomations")}</FeatureRow>
                      <FeatureRow ok={plan.feature_meta_ads}>{t("pricingPage.metaAdsDashboard")}</FeatureRow>
                      <FeatureRow ok={plan.feature_api_access}>{t("pricingPage.apiAccess")}</FeatureRow>
                      <FeatureRow ok={plan.feature_priority_support}>
                        {t("pricingPage.prioritySupport")}
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
          {t("pricingPage.needMoreAi")}{" "}
          <button
            onClick={() => session ? navigate("/billing") : navigate("/auth")}
            className="underline hover:text-foreground transition-colors"
          >
            {t("pricingPage.aiBoostFrom")}
          </button>
          {" "}{t("pricingPage.aiBoostNote")}
        </div>

        {/* Comparison to competitors */}
        <Card className="mt-10">
          <CardHeader>
            <CardTitle>{t("pricingPage.comparisonTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2">{t("pricingPage.colCrm")}</th>
                    <th className="py-2">{t("pricingPage.colEquivalentPlan")}</th>
                    <th className="py-2 text-right">{t("pricingPage.colMonthlyCost")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b bg-primary/5">
                    <td className="py-2 font-semibold">Klosify CRM Pro</td>
                    <td className="py-2">{t("pricingPage.klosifyEquivalent")}</td>
                    <td className="py-2 text-right font-bold text-primary">$59 USD</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">Kommo Advanced</td>
                    <td className="py-2">{t("pricingPage.kommoEquivalent")}</td>
                    <td className="py-2 text-right">$75 USD</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">HubSpot Sales Starter</td>
                    <td className="py-2">{t("pricingPage.hubspotEquivalent")}</td>
                    <td className="py-2 text-right">$60 USD</td>
                  </tr>
                  <tr>
                    <td className="py-2">Pipedrive Professional</td>
                    <td className="py-2">{t("pricingPage.pipedriveEquivalent")}</td>
                    <td className="py-2 text-right">$117 USD</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {t("pricingPage.comparisonFootnote")}
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
