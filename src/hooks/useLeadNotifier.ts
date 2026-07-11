import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { toast } from "sonner";

export function useLeadNotifier() {
  const { user } = useAuth();
  const { organizationId } = useOrganizationContext();

  useEffect(() => {
    if (!user || !organizationId) return;
    const channel = supabase
      .channel(`lead-notifier-${organizationId}`)
      .on(
        "postgres_changes",
        // Solo leads de la organización activa — sin el filtro, las
        // notificaciones mostraban nombres/campañas de leads de OTRAS orgs.
        { event: "INSERT", schema: "public", table: "contacts", filter: `organization_id=eq.${organizationId}` },
        (payload) => {
          const row: any = payload.new;
          if (!row) return;
          const source = String(row.source || "").toLowerCase();
          if (!source.startsWith("facebook")) return;
          const name = row.full_name || "Lead nuevo";
          toast.success(`Nuevo lead de Facebook: ${name}`, {
            description: row.campaign ? `Campaña: ${row.campaign}` : undefined,
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, organizationId]);
}
