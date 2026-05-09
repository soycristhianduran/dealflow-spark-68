/**
 * Subdomain utilities for workspace URL routing.
 *
 * URL structure:
 *   app.aceleradoradeventas.co          → main app (login / register)
 *   {slug}.app.aceleradoradeventas.co   → specific workspace
 *   localhost / 127.0.0.1               → dev (no subdomain)
 */

const ROOT_DOMAIN = "app.aceleradoradeventas.co";

/**
 * Returns the workspace slug from the current hostname, or null if we're on
 * the root domain / localhost / a non-subdomain host.
 *
 * Examples:
 *   "aceleradora.app.aceleradoradeventas.co" → "aceleradora"
 *   "app.aceleradoradeventas.co"             → null
 *   "localhost"                              → null
 */
export function getWorkspaceSlug(): string | null {
  const hostname = window.location.hostname;

  // Local development — no subdomain
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
  ) {
    return null;
  }

  // e.g. "cristhian.app.aceleradoradeventas.co"
  if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    return hostname.slice(0, hostname.length - ROOT_DOMAIN.length - 1);
  }

  // Vercel preview URLs or other custom domains → no slug routing
  return null;
}

/**
 * Builds the full workspace URL for a given slug.
 */
export function buildWorkspaceUrl(slug: string): string {
  return `https://${slug}.${ROOT_DOMAIN}`;
}

/**
 * Returns the root app URL (login / register).
 */
export function getRootAppUrl(): string {
  return `https://${ROOT_DOMAIN}`;
}

/**
 * Validates a slug candidate.
 * Rules: 3-30 chars, lowercase letters, numbers, hyphens only. Cannot start or end with hyphen.
 */
export function validateSlug(slug: string): { valid: boolean; error?: string } {
  if (slug.length < 3) return { valid: false, error: "Mínimo 3 caracteres" };
  if (slug.length > 30) return { valid: false, error: "Máximo 30 caracteres" };
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
    return {
      valid: false,
      error: "Solo letras minúsculas, números y guiones. No puede empezar ni terminar con guión.",
    };
  }
  return { valid: true };
}

/**
 * Converts any string to a valid slug candidate (does NOT guarantee uniqueness).
 */
export function toSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9\s-]/g, "")    // remove special chars
    .trim()
    .replace(/[\s_]+/g, "-")          // spaces/underscores → hyphens
    .replace(/-+/g, "-")              // collapse multiple hyphens
    .slice(0, 30);
}
