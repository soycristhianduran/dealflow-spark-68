import { createContext, useContext } from "react";
import { useOrganization, type Organization } from "@/hooks/useOrganization";

interface OrganizationContextType {
  organizationId: string | null;
  organization: Organization | null;
  role: string | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const OrganizationContext = createContext<OrganizationContextType>({
  organizationId: null,
  organization: null,
  role: null,
  loading: true,
  error: null,
  refetch: () => {},
});

export function useOrganizationContext(): OrganizationContextType {
  return useContext(OrganizationContext);
}

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const orgState = useOrganization();

  return (
    <OrganizationContext.Provider value={orgState}>
      {children}
    </OrganizationContext.Provider>
  );
}
