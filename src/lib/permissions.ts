/**
 * Modelo de permisos por miembro (estilo Kommo, adaptado a Klosify).
 *
 * Cada miembro puede tener un objeto `permissions` (jsonb en organization_members)
 * que sobreescribe, entidad por entidad y acción por acción, lo que su rol
 * permitiría por defecto. Si un miembro NO tiene override para una acción, se
 * usa el default de su rol — así el comportamiento actual queda intacto para
 * quien no personalice nada.
 *
 * Niveles (para ver/editar/eliminar):
 *   none → Denegado
 *   own  → Solo si es responsable (owner_id / setter_id === yo)
 *   all  → Todo el equipo (todos los registros de la organización)
 *
 * create/export son sí/no (se guardan como "all" o "none").
 */

export type PermLevel = "none" | "own" | "all";
export type PermAction = "view" | "create" | "edit" | "delete" | "export";
export type PermEntity = "leads" | "companies" | "tasks" | "products";

export type EntityPerms = Partial<Record<PermAction, PermLevel>>;
export type MemberPermissions = Partial<Record<PermEntity, EntityPerms>>;

export const PERM_ENTITIES: { key: PermEntity; label: string }[] = [
  { key: "leads", label: "Leads / Contactos" },
  { key: "companies", label: "Compañías" },
  { key: "tasks", label: "Tareas" },
  { key: "products", label: "Productos" },
];

export const PERM_ACTIONS: { key: PermAction; label: string; binary?: boolean }[] = [
  { key: "view", label: "Ver" },
  { key: "create", label: "Crear", binary: true },
  { key: "edit", label: "Editar" },
  { key: "delete", label: "Eliminar" },
  { key: "export", label: "Exportar", binary: true },
];

/** Etiquetas legibles de cada nivel (Kommo-style). */
export const LEVEL_LABEL: Record<PermLevel, string> = {
  none: "Denegado",
  own: "Solo si es responsable",
  all: "Todo el equipo",
};

/** Defaults por rol — reflejan el comportamiento histórico de Klosify. */
export function roleDefault(role: string | null, action: PermAction): PermLevel {
  const admin = role === "owner" || role === "admin" || role === "gestor";
  if (admin) return "all";
  if (role === "readonly") return action === "view" ? "all" : "none";
  // vendor / setter (y cualquier "member" heredado)
  switch (action) {
    case "view": return "own";
    case "create": return "all"; // pueden crear
    case "edit": return "own";
    case "delete": return "none";
    case "export": return "none";
    default: return "none";
  }
}

/**
 * Nivel efectivo de una acción para un miembro.
 * @param orgDefaultLeadView  visibilidad de leads por defecto de la organización
 *   ("all" para que setters/vendedores vean todos los leads). Solo aplica a
 *   leads.view cuando el miembro no tiene override propio.
 */
export function effectiveLevel(
  entity: PermEntity,
  action: PermAction,
  opts: { role: string | null; override?: MemberPermissions | null; orgDefaultLeadView?: PermLevel | null },
): PermLevel {
  const { role, override, orgDefaultLeadView } = opts;
  const admin = role === "owner" || role === "admin" || role === "gestor";

  // Owner/admin/gestor son SIEMPRE acceso total: los overrides por-miembro se
  // diseñaron para vendedores/setters/readonly. Ignorarlos aquí evita que un
  // admin pueda quedar (por error o config) limitado a "solo los suyos" y que
  // dos admins de la misma organización vean números distintos.
  if (admin) return roleDefault(role, action);

  const ov = override?.[entity]?.[action];
  if (ov === "none" || ov === "own" || ov === "all") return ov;

  // El default de leads de la org aplica a cualquier miembro no-admin sin override
  // propio (vendor, setter o "member" genérico); readonly ya ve todo por defecto.
  if (!admin && role !== "readonly" && entity === "leads" && action === "view" &&
      (orgDefaultLeadView === "all" || orgDefaultLeadView === "own")) {
    return orgDefaultLeadView;
  }
  return roleDefault(role, action);
}
