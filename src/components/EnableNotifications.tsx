import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { pushSupported, isPushEnabled, enablePush } from "@/lib/push";
import { useOrganizationContext } from "@/context/OrganizationContext";

/** Small "Activar notificaciones" button; hides itself once enabled/unsupported. */
export function EnableNotifications() {
  const { organizationId } = useOrganizationContext();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => { isPushEnabled().then(setEnabled); }, []);

  if (!pushSupported() || enabled) return null;

  const enable = async () => {
    setWorking(true);
    const r = await enablePush(organizationId);
    setWorking(false);
    if (r.ok) { setEnabled(true); toast.success("Notificaciones activadas 🔔"); }
    else if (r.reason === "denied") toast.error("Permiso de notificaciones bloqueado. Actívalo en los ajustes del navegador.");
    else toast.error("No se pudieron activar las notificaciones.");
  };

  return (
    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={enable} disabled={working}
      title="Activar notificaciones de mensajes nuevos">
      <Bell className="h-3.5 w-3.5" />
    </Button>
  );
}
