import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export function useLeadNotifier() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("lead-notifier")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "contacts" },
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
  }, [user]);
}
