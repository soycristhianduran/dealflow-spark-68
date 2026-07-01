import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { pushSupported, isPushEnabled, enablePush } from "@/lib/push";
import { useOrganizationContext } from "@/context/OrganizationContext";

const DISMISS_KEY = "klosify_notif_banner_dismissed";

/**
 * Soft-ask banner shown once above the conversation list, prompting the user to
 * enable message notifications. Dismissible (remembered); hides when enabled or
 * unsupported. The actual permission dialog fires from the "Activar" click.
 */
export function NotificationsBanner() {
  const { organizationId } = useOrganizationContext();
  const [show, setShow] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!pushSupported()) return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    isPushEnabled().then((on) => { if (!on) setShow(true); });
  }, []);

  if (!show) return null;

  const activate = async () => {
    setWorking(true);
    const r = await enablePush(organizationId);
    setWorking(false);
    if (r.ok) { setShow(false); toast.success("Notificaciones activadas 🔔"); }
    else if (r.reason === "denied") toast.error("Permiso bloqueado. Actívalo en los ajustes del navegador.");
    else toast.error("No se pudieron activar.");
  };
  const dismiss = () => { setShow(false); localStorage.setItem(DISMISS_KEY, "1"); };

  return (
    <div className="mx-3 mt-3 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Bell className="h-4.5 w-4.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">Activa las notificaciones</p>
        <p className="text-[11px] text-muted-foreground">Entérate al instante cuando lleguen mensajes nuevos.</p>
      </div>
      <button onClick={activate} disabled={working}
        className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60">
        {working ? "..." : "Activar"}
      </button>
      <button onClick={dismiss} className="shrink-0 text-muted-foreground hover:text-foreground" title="Ahora no">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
