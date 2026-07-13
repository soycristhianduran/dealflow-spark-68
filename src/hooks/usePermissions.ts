import { useOrganizationContext } from "@/context/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { effectiveLevel, type PermAction, type PermEntity, type PermLevel } from "@/lib/permissions";

/**
 * Centralised permission checks based on the current user's org role.
 *
 * Roles (hierarchy high → low):
 *   owner    – full access, cannot be removed
 *   admin    – full access, managed by owner
 *   vendor   – can create/edit their own contacts; no settings, no delete, no export
 *   readonly – view only
 */
export function usePermissions() {
  const { role, permissions, defaultLeadVisibility } = useOrganizationContext();
  const { user } = useAuth();

  const myUserId = user?.id ?? null;

  /** Nivel efectivo (none/own/all) de una acción sobre una entidad para este usuario. */
  const level = (entity: PermEntity, action: PermAction): PermLevel =>
    effectiveLevel(entity, action, { role, override: permissions ?? null, orgDefaultLeadView: defaultLeadVisibility ?? null });

  /** Visibilidad de leads: "all" ve todos, "own" solo los suyos, "none" ninguno. */
  const leadView: PermLevel = level("leads", "view");
  // 'gestor' is a non-billable manager (platform/agency staff) with full
  // owner-like access inside the org. Treat it exactly like owner/admin.
  const isGestor = role === "gestor";
  const isOwnerOrAdmin = role === "owner" || role === "admin" || isGestor;
  // Setter has the SAME permissions as a vendor; it only differs at the dashboard
  // level (setters book appointments, vendors close them).
  const isSetter = role === "setter";
  const isVendor = role === "vendor" || isSetter;
  const isReadonly = role === "readonly";

  /** Can open the Settings page and manage org config */
  const canAccessSettings = isOwnerOrAdmin;

  // Estas tres respetan overrides por miembro; sin override, caen al default del
  // rol (mismo comportamiento de siempre).
  /** Can delete contact records */
  const canDeleteContacts = level("leads", "delete") !== "none";

  /** Can create and edit contacts */
  const canEditContacts = level("leads", "edit") !== "none";

  /** Can export the contacts database */
  const canExportData = level("leads", "export") === "all";

  /**
   * Can MANAGE power/config features: Automations, Integrations, Meta Ads,
   * WA Templates, IG Automations, Email Campaigns, AI Agents.
   * Only owner/admin can create/edit these.
   */
  const canAccessPowerFeatures = isOwnerOrAdmin;

  /**
   * Can VIEW the power features (advanced section). Readonly members get full
   * visibility (view-only) like a manager; vendors stay scoped out.
   */
  const canViewPowerFeatures = isOwnerOrAdmin || isReadonly;

  /**
   * Can see the budget/deal-value of a given contact.
   *  - admin/owner  → always
   *  - vendor       → only their own contacts (owner_id matches)
   *  - readonly     → never
   */
  const canSeeBudget = (contactOwnerId: string | null | undefined): boolean => {
    if (isOwnerOrAdmin) return true;
    if (leadView === "all") return true;
    if (isVendor) return !!myUserId && contactOwnerId === myUserId;
    return false; // readonly
  };

  return {
    myUserId,
    role,
    isOwnerOrAdmin,
    isGestor,
    isVendor,
    isSetter,
    isReadonly,
    canAccessSettings,
    canAccessPowerFeatures,
    canViewPowerFeatures,
    canDeleteContacts,
    canEditContacts,
    canExportData,
    canSeeBudget,
    /** Nivel efectivo por entidad/acción (respeta overrides + rol). */
    level,
    /** Visibilidad de leads: all | own | none. */
    leadView,
  };
}
