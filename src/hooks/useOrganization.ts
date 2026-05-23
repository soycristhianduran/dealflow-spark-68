import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getWorkspaceSlug } from "@/lib/subdomain";

export interface Organization {
  id: string;
  name: string;
  slug: string | null;
  created_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  created_at: string;
}

interface UseOrganizationResult {
  organizationId: string | null;
  organization: Organization | null;
  role: string | null;
  loading: boolean;
  error: string | null;
  /** True when the user is accessing a workspace subdomain they are NOT a member of */
  accessDenied: boolean;
  refetch: () => void;
}

export function useOrganization(): UseOrganizationResult {
  const { user } = useAuth();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [tick, setTick] = useState(0);

  const refetch = () => setTick(t => t + 1);

  useEffect(() => {
    if (!user) {
      setOrganizationId(null);
      setOrganization(null);
      setRole(null);
      setLoading(false);
      setAccessDenied(false);
      return;
    }

    let cancelled = false;

    const fetchOrg = async () => {
      setLoading(true);
      setError(null);
      setAccessDenied(false);

      try {
        // ── Subdomain-based resolution ─────────────────────────────────────────
        // If the user is on e.g. "aceleradora.app.aceleradoradeventas.co",
        // we resolve the org by slug and verify the current user is a member.
        const workspaceSlug = getWorkspaceSlug();

        if (workspaceSlug) {
          // Find org by slug
          const { data: orgBySlug, error: slugErr } = await supabase
            .from("organizations")
            .select("id, name, slug, created_at")
            .eq("slug", workspaceSlug)
            .maybeSingle();

          if (slugErr) throw slugErr;

          if (!orgBySlug) {
            // Slug doesn't match any org
            if (!cancelled) {
              setOrganizationId(null);
              setOrganization(null);
              setRole(null);
              setAccessDenied(true);
              setLoading(false);
            }
            return;
          }

          // Verify current user is a member via SECURITY DEFINER RPC
          const { data: myOrgs } = await supabase.rpc("get_my_organization");
          const membership = myOrgs?.find((r: any) => r.organization_id === orgBySlug.id);

          if (!membership) {
            // User is not a member of this workspace
            if (!cancelled) {
              setOrganizationId(null);
              setOrganization(null);
              setRole(null);
              setAccessDenied(true);
              setLoading(false);
            }
            return;
          }

          if (!cancelled) {
            setOrganizationId(orgBySlug.id);
            setOrganization(orgBySlug as Organization);
            // RPC returns member_role (not role) — support both field names
            setRole(membership.member_role ?? membership.role ?? null);
          }
          // Fix #5: mark this org as the user's most-recently-active workspace
          // so auth_user_org_id() returns the right org for multi-org users.
          supabase.rpc("touch_active_org", { p_org_id: orgBySlug.id }).catch(() => null);
          return;
        }

        // ── Default resolution: use SECURITY DEFINER RPC (bypasses RLS) ─────────
        const { data: rpcRows, error: rpcError } = await supabase
          .rpc("get_my_organization");

        if (rpcError) throw rpcError;

        const row = rpcRows?.[0];
        if (!row) {
          if (!cancelled) {
            setOrganizationId(null);
            setOrganization(null);
            setRole(null);
            setLoading(false);
          }
          return;
        }

        if (!cancelled) {
          setOrganizationId(row.organization_id);
          setOrganization({
            id: row.organization_id,
            name: row.org_name,
            slug: row.org_slug,
            created_at: "",
          });
          setRole(row.member_role);
        }
        // Fix #5: touch active org for default resolution too
        supabase.rpc("touch_active_org", { p_org_id: row.organization_id }).catch(() => null);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message ?? "Error fetching organization");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchOrg();
    return () => { cancelled = true; };
  }, [user, tick]);

  return { organizationId, organization, role, loading, error, accessDenied, refetch };
}
