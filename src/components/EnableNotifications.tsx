import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { pushSupported, isPushEnabled, enablePush, disablePush } from "@/lib/push";
import { useOrganizationContext } from "@/context/OrganizationContext";

/** Toggle de notificaciones: activa o desactiva las notificaciones push. */
export function EnableNotifications() {
  const { organizationId } = useOrganizationContext();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => { isPushEnabled().then(setEnabled); }, []);

  if (!pushSupported() || enabled === null) return null;

  const toggle = async () => {
    setWorking(true);
    if (enabled) {
      await disablePush();
      setEnabled(false);
      setWorking(false);
      toast.success("Notificaciones desactivadas 🔕");
      return;
    }
    const r = await enablePush(organizationId);
    setWorking(false);
    if (r.ok) { setEnabled(true); toast.success("Notificaciones activadas 🔔"); }
    else if (r.reason === "denied") toast.error("Permiso de notificaciones bloqueado. Actívalo en los ajustes del navegador.");
    else toast.error("No se pudieron activar las notificaciones.");
  };

  return (
    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={toggle} disabled={working}
      title={enabled ? "Desactivar notificaciones" : "Activar notificaciones de mensajes nuevos"}>
      {enabled ? <BellOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Bell className="h-3.5 w-3.5" />}
    </Button>
  );
}
