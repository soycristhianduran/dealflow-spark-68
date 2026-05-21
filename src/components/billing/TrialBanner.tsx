/**
 * TrialBanner — shows above all workspace pages when the user is in the
 * 14-day Pro trial. Surfaces:
 *
 *   - Days remaining in trial
 *   - "Upgrade" button → goes to /billing
 *   - When days <= 3: more urgent styling (amber → red)
 *
 * Renders nothing when:
 *   - Subscription is `active` (paying customer)
 *   - Trial is locked out (handled by LockoutScreen, not us)
 *   - No subscription yet (rare race during signup)
 */

import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Zap } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useWorkspace } from "@/hooks/useWorkspace";

export function TrialBanner() {
  const { subscription, daysLeftInTrial, locked, loading } = useSubscription();
  const { path } = useWorkspace();
  const location = useLocation();

  // Don't show anything while loading, when locked (LockoutScreen takes
  // over), on the /billing page itself, or when not in trial at all.
  if (loading || locked || !subscription) return null;
  if (subscription.status !== "trialing_internal") return null;
  if (location.pathname.endsWith("/billing")) return null;

  const days = daysLeftInTrial ?? 0;
  const urgent = days <= 3;

  return (
    <div
      className={[
        "px-4 py-2 flex items-center justify-between gap-3 text-sm",
        urgent
          ? "bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900 text-red-900 dark:text-red-200"
          : "bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        {urgent ? (
          <AlertTriangle className="h-4 w-4 shrink-0" />
        ) : (
          <Zap className="h-4 w-4 shrink-0" />
        )}
        <span>
          {days === 0
            ? "Tu prueba gratuita termina hoy. Elige un plan para continuar."
            : days === 1
            ? "Tu prueba gratuita termina mañana."
            : `Tu prueba gratuita en Pro termina en ${days} días.`}
        </span>
      </div>
      <Button
        asChild
        size="sm"
        variant={urgent ? "destructive" : "default"}
        className="shrink-0"
      >
        <Link to={`${path}/billing`}>Elegir plan</Link>
      </Button>
    </div>
  );
}
