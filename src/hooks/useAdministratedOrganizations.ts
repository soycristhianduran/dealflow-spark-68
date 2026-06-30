/**
 * useAdministratedOrganizations — every organization the current user belongs to,
 * with their role in each. Powers the org-switcher dropdown so multi-org users
 * (especially non-billable "gestor" managers) can jump between the workspaces
 * they administer. Backed by the get_my_administrated_organizations() RPC.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AdminOrg {
  organizationId: string;
  name: string;
  slug: string;
  role: string;
  lastActiveAt: string | null;
}

export function useAdministratedOrganizations() {
  const [orgs, setOrgs] = useState<AdminOrg[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_my_administrated_organizations");
    if (error) {
      console.warn("get_my_administrated_organizations failed:", error);
      setOrgs([]);
      setLoading(false);
      return;
    }
    setOrgs(
      (data ?? []).map((r: any) => ({
        organizationId: r.organization_id,
        name: r.org_name,
        slug: r.org_slug,
        role: r.member_role,
        lastActiveAt: r.last_active_at,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  return { orgs, loading, refetch: fetchOrgs };
}
