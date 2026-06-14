import { useOrganizationContext } from "@/context/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";

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
  const { role } = useOrganizationContext();
  const { user } = useAuth();

  const myUserId = user?.id ?? null;
  const isOwnerOrAdmin = role === "owner" || role === "admin";
  const isVendor = role === "vendor";
  const isReadonly = role === "readonly";

  /** Can open the Settings page and manage org config */
  const canAccessSettings = isOwnerOrAdmin;

  /** Can delete contact records */
  const canDeleteContacts = isOwnerOrAdmin;

  /** Can create and edit contacts */
  const canEditContacts = isOwnerOrAdmin || isVendor;

  /** Can export the contacts database */
  const canExportData = isOwnerOrAdmin;

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
    if (isVendor) return !!myUserId && contactOwnerId === myUserId;
    return false; // readonly
  };

  return {
    myUserId,
    role,
    isOwnerOrAdmin,
    isVendor,
    isReadonly,
    canAccessSettings,
    canAccessPowerFeatures,
    canViewPowerFeatures,
    canDeleteContacts,
    canEditContacts,
    canExportData,
    canSeeBudget,
  };
}
