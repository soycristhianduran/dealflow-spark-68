/**
 * LockoutScreen — replaces the entire workspace when the trial has
 * expired without payment or the subscription is canceled / unpaid.
 *
 * The user can ONLY:
 *   - View the /billing page (to upgrade)
 *   - Log out
 *
 * Everything else inside the workspace is blocked at the App level
 * (WorkspaceRoutes wraps its children in this when `locked === true`).
 */

import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Lock, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useWorkspace } from "@/hooks/useWorkspace";

export function LockoutScreen() {
  const { signOut } = useAuth();
  const { subscription } = useSubscription();
  const { path } = useWorkspace();
  const navigate = useNavigate();

  const status = subscription?.status;
  const headline =
    status === "canceled"
      ? "Tu suscripción fue cancelada"
      : status === "unpaid" || status === "past_due"
      ? "Tu pago no se procesó"
      : "Tu prueba gratuita terminó";

  const description =
    status === "canceled"
      ? "Tu acceso al CRM está pausado. Reactiva tu suscripción para continuar trabajando con tus datos."
      : status === "unpaid" || status === "past_due"
      ? "Actualiza tu método de pago para reanudar tu acceso al CRM."
      : "Para seguir usando Klosify CRM, elige un plan que se ajuste a tu equipo.";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
          <Lock className="h-8 w-8 text-amber-700 dark:text-amber-300" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{headline}</h1>
          <p className="text-muted-foreground">{description}</p>
        </div>

        <div className="space-y-2">
          <Button
            className="w-full"
            size="lg"
            onClick={() => navigate(path("/billing"))}
          >
            Elegir un plan
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={async () => { await signOut(); }}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Cerrar sesión
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          ¿Dudas? Escríbenos a{" "}
          <a
            href="mailto:hola@klosify.com"
            className="underline hover:text-foreground"
          >
            hola@klosify.com
          </a>
        </p>
      </div>
    </div>
  );
}
