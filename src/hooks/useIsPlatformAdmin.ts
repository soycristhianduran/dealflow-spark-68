import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * True only for the SaaS platform owner (rows in platform_admins are
 * RLS-protected: each admin can read only their own row, everyone else
 * gets an empty result). Used to gate internal/support-only UI.
 */
export function useIsPlatformAdmin() {
  const { user } = useAuth();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  useEffect(() => {
    if (!user) { setIsPlatformAdmin(false); return; }
    supabase.from("platform_admins").select("user_id").maybeSingle()
      .then(({ data }) => setIsPlatformAdmin(!!data));
  }, [user?.id]);

  return isPlatformAdmin;
}
