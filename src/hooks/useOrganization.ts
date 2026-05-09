import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Organization {
  id: string;
  name: string;
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
  refetch: () => void;
}

export function useOrganization(): UseOrganizationResult {
  const { user } = useAuth();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = () => setTick(t => t + 1);

  useEffect(() => {
    if (!user) {
      setOrganizationId(null);
      setOrganization(null);
      setRole(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchOrg = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: memberData, error: memberError } = await supabase
          .from("organization_members")
          .select("id, organization_id, role")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (memberError) throw memberError;
        if (!memberData) {
          if (!cancelled) {
            setOrganizationId(null);
            setOrganization(null);
            setRole(null);
            setLoading(false);
          }
          return;
        }

        const { data: orgData, error: orgError } = await supabase
          .from("organizations")
          .select("id, name, created_at")
          .eq("id", memberData.organization_id)
          .single();

        if (orgError) throw orgError;

        if (!cancelled) {
          setOrganizationId(memberData.organization_id);
          setOrganization(orgData as Organization);
          setRole(memberData.role);
        }
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

  return { organizationId, organization, role, loading, error, refetch };
}
