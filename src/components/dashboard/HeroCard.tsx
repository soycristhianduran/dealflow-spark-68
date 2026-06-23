/**
 * HeroCard — the showcase card at the top of the dashboard.
 *
 * What it does:
 *   - Personalized greeting that swaps based on time of day
 *   - Date in long Spanish format
 *   - Two hero metrics (pipeline value + open deals) on the right
 *   - Contextual CTA depending on what the user should do next
 *
 * Visual:
 *   - Sunset gradient background (orange → coral → fuchsia)
 *   - White text with subtle drop-shadow for legibility
 *   - Glassmorphic-ish metric tiles on the right
 */

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowRight, Sparkles, TrendingUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/hooks/useWorkspace";

interface Props {
  pipelineValue: number;
  pipelineCurrency: string;
  dealsOpen: number;
  tasksPending: number;
  newLeadsThisWeek: number;
}

function greetingKeyForTime(): string {
  const h = new Date().getHours();
  if (h < 12) return "goodMorning";
  if (h < 19) return "goodAfternoon";
  return "goodEvening";
}

function formatCurrency(value: number, currency: string) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M ${currency}`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K ${currency}`;
  return `${value.toLocaleString("es-CO")} ${currency}`;
}

export function HeroCard({
  pipelineValue,
  pipelineCurrency,
  dealsOpen,
  tasksPending,
  newLeadsThisWeek,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { path } = useWorkspace();

  const firstName =
    (user?.user_metadata?.first_name as string | undefined) ||
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ||
    user?.email?.split("@")[0] ||
    "";

  // Contextual CTA — pick the most relevant action
  let cta: { label: string; to: string; subtitle: string };
  if (tasksPending > 0) {
    cta = {
      label: t("heroCard.ctaTasksLabel", { count: tasksPending }),
      to: path("/tasks"),
      subtitle: t("heroCard.ctaTasksSubtitle"),
    };
  } else if (dealsOpen > 0) {
    cta = {
      label: t("heroCard.ctaDealsLabel", { count: dealsOpen }),
      to: path("/pipeline"),
      subtitle: t("heroCard.ctaDealsSubtitle"),
    };
  } else if (newLeadsThisWeek > 0) {
    cta = {
      label: t("heroCard.ctaLeadsLabel"),
      to: path("/leads"),
      subtitle: t("heroCard.ctaLeadsSubtitle", { count: newLeadsThisWeek }),
    };
  } else {
    cta = {
      label: t("heroCard.ctaFirstLeadLabel"),
      to: path("/leads"),
      subtitle: t("heroCard.ctaFirstLeadSubtitle"),
    };
  }

  return (
    <div
      className="relative overflow-hidden rounded-2xl text-white shadow-lg"
      style={{
        backgroundImage:
          "linear-gradient(135deg, hsl(24 95% 53%) 0%, hsl(18 88% 50%) 45%, hsl(345 84% 56%) 100%)",
      }}
    >
      {/* Decorative blur orbs in the background */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full opacity-40 blur-3xl"
        style={{ backgroundColor: "hsl(45 95% 65%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-12 -left-8 h-40 w-40 rounded-full opacity-30 blur-3xl"
        style={{ backgroundColor: "hsl(351 84% 65%)" }}
      />

      <div className="relative grid gap-6 p-6 md:grid-cols-[1.4fr_1fr] md:p-8">
        {/* Left: greeting + CTA */}
        <div className="space-y-4 min-w-0">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-white/80">
              {format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })}
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">
              {t(`heroCard.${greetingKeyForTime()}`)}{firstName ? `, ${firstName}` : ""} 👋
            </h1>
          </div>

          <p className="text-sm leading-relaxed text-white/90 max-w-md">
            {cta.subtitle}
          </p>

          <Button
            asChild
            size="lg"
            className="bg-white text-foreground hover:bg-white/90 shadow-md gap-2 font-semibold"
          >
            <Link to={cta.to}>
              {cta.label}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* Right: hero metrics */}
        <div className="grid grid-cols-2 gap-3 self-end md:self-center">
          <MetricTile
            label={t("heroCard.pipelineValue")}
            value={formatCurrency(pipelineValue, pipelineCurrency)}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <MetricTile
            label={t("heroCard.dealsOpen")}
            value={String(dealsOpen)}
            icon={<Sparkles className="h-4 w-4" />}
          />
        </div>
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/20 bg-white/15 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between text-white/80">
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
