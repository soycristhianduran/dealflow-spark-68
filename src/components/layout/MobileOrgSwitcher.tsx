import { useState } from "react";
import { Building2, Check, ChevronDown, Shield } from "lucide-react";
import { useAdministratedOrganizations } from "@/hooks/useAdministratedOrganizations";
import { useOrganizationContext } from "@/context/OrganizationContext";

/**
 * MobileOrgSwitcher — "Cambiar cuenta" card for the mobile More tab. Shows the
 * current organization and, when tapped, a list of all organizations the user
 * belongs to. Switching does a full navigation so all org-scoped state resets.
 * Hidden when the user only belongs to one org.
 */
export function MobileOrgSwitcher() {
  const { orgs } = useAdministratedOrganizations();
  const { organizationId, organization } = useOrganizationContext();
  const [open, setOpen] = useState(false);

  if (orgs.length <= 1) return null;

  const current = orgs.find((o) => o.organizationId === organizationId);
  const currentName = current?.name || organization?.name || "Organización";

  const go = (slug: string, id: string) => {
    if (id === organizationId) { setOpen(false); return; }
    window.location.href = `/w/${slug}`;
  };

  return (
    <div className="mb-4 overflow-hidden rounded-xl border bg-card">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-semibold">{currentName}</div>
          <div className="text-[11px] text-muted-foreground">Cambiar cuenta / organización</div>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="max-h-[50vh] overflow-y-auto border-t">
          {orgs.map((o) => (
            <button key={o.organizationId} onClick={() => go(o.slug, o.organizationId)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted">
              {o.role === "gestor"
                ? <Shield className="h-4 w-4 shrink-0 text-amber-500" />
                : <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className="flex-1 truncate text-sm">{o.name}</span>
              {o.organizationId === organizationId && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
