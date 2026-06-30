import { Building2, Check, ChevronsUpDown, Shield } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdministratedOrganizations } from "@/hooks/useAdministratedOrganizations";
import { useOrganizationContext } from "@/context/OrganizationContext";

/**
 * OrgSwitcher — dropdown to jump between the organizations the user administers.
 * Hidden when the user only belongs to a single org (nothing to switch to).
 * Switching does a full navigation to /w/{slug} so all org-scoped contexts and
 * realtime channels re-initialize cleanly.
 */
export function OrgSwitcher({ collapsed }: { collapsed: boolean }) {
  const { orgs } = useAdministratedOrganizations();
  const { organizationId, organization } = useOrganizationContext();

  if (orgs.length <= 1) return null;

  const current = orgs.find((o) => o.organizationId === organizationId);
  const currentName = current?.name || organization?.name || "Organización";

  const go = (slug: string) => {
    window.location.href = `/w/${slug}`;
  };

  return (
    <div className="px-2 pt-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex w-full items-center gap-2 rounded-md border border-sidebar-border/60 px-2.5 py-2 text-sm hover:bg-sidebar-accent transition-colors"
          title={currentName}
        >
          <Building2 className="h-4 w-4 shrink-0 text-primary" />
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-left font-medium">{currentName}</span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60 max-h-[60vh] overflow-y-auto">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Organizaciones que administras
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {orgs.map((o) => (
            <DropdownMenuItem
              key={o.organizationId}
              onClick={() => o.organizationId !== organizationId && go(o.slug)}
              className="flex items-center gap-2"
            >
              {o.role === "gestor" ? (
                <Shield className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              ) : (
                <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              <span className="flex-1 truncate">{o.name}</span>
              {o.organizationId === organizationId && <Check className="h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
