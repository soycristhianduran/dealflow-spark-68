import { createContext, useContext, useEffect, useState } from "react";
import { useOrganization, type Organization } from "@/hooks/useOrganization";
import { getRootAppUrl, getWorkspaceSlug } from "@/lib/subdomain";
import { supabase } from "@/integrations/supabase/client";

interface OrganizationContextType {
  organizationId: string | null;
  organization: Organization | null;
  role: string | null;
  /** Org's default currency for lead budgets (e.g. "COP"). Falls back to "USD". */
  defaultCurrency: string;
  loading: boolean;
  error: string | null;
  accessDenied: boolean;
  refetch: () => void;
}

const OrganizationContext = createContext<OrganizationContextType>({
  organizationId: null,
  organization: null,
  role: null,
  defaultCurrency: "USD",
  loading: true,
  error: null,
  accessDenied: false,
  refetch: () => {},
});

export function useOrganizationContext(): OrganizationContextType {
  return useContext(OrganizationContext);
}

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const orgState = useOrganization();
  const [defaultCurrency, setDefaultCurrency] = useState("USD");

  useEffect(() => {
    if (!orgState.organizationId) { setDefaultCurrency("USD"); return; }
    let active = true;
    supabase.from("organizations").select("default_currency").eq("id", orgState.organizationId).maybeSingle()
      .then(({ data }) => { if (active && data?.default_currency) setDefaultCurrency(data.default_currency); });
    return () => { active = false; };
  }, [orgState.organizationId]);

  // If the user is on a workspace subdomain but is NOT a member, show an
  // access-denied screen instead of rendering the full app.
  if (orgState.accessDenied && !orgState.loading) {
    const slug = getWorkspaceSlug();
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 mx-auto">
            <svg className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m2-10a7 7 0 110 14A7 7 0 0112 5z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Acceso denegado</h1>
          <p className="text-muted-foreground">
            No tienes acceso al espacio de trabajo{" "}
            <strong className="text-foreground">{slug}</strong>.
            Debes ser invitado por el administrador de esa organización.
          </p>
          <a
            href={getRootAppUrl()}
            className="inline-block mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Ir al inicio
          </a>
        </div>
      </div>
    );
  }

  return (
    <OrganizationContext.Provider value={{ ...orgState, defaultCurrency }}>
      {children}
    </OrganizationContext.Provider>
  );
}
