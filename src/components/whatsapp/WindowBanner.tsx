import { AlertCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WindowStatus } from "./helpers";

/**
 * Banner shown above the message thread when the 24h Meta messaging
 * window is closing or closed. The closed-state CTA opens the template
 * picker so the user can still reach out via an approved template.
 */
export function WindowBanner({
  status,
  lastIncoming,
  onTemplate,
}: {
  status: WindowStatus;
  lastIncoming: Date | null;
  onTemplate: () => void;
}) {
  if (status === "open") return null;

  if (status === "closing" && lastIncoming) {
    const hoursLeft = 24 - (Date.now() - lastIncoming.getTime()) / 3_600_000;
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span>
          Ventana de 24h cerrando — quedan ≈{Math.round(hoursLeft)}h para enviar mensajes libres.
        </span>
      </div>
    );
  }

  // status === "closed"
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800 text-xs text-red-900 dark:text-red-200">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span>
          <span className="font-semibold">Ventana de 24h cerrada.</span>{" "}
          El contacto debe escribirte primero, o envía una plantilla.
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={onTemplate}
        className="h-7 text-xs gap-1 border-red-300 text-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/50"
      >
        Enviar plantilla
      </Button>
    </div>
  );
}
