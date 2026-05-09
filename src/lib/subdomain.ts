/**
 * Workspace URL routing utilities.
 *
 * Current mode (Vercel Hobby): path-based
 *   app.aceleradoradeventas.co/w/{slug}   → specific workspace
 *   app.aceleradoradeventas.co            → main app
 *
 * Future mode (Vercel Pro): subdomain-based
 *   {slug}.app.aceleradoradeventas.co     → specific workspace
 *   app.aceleradoradeventas.co            → main app
 *
 * To switch to Pro mode: set VITE_WORKSPACE_MODE=subdomain in Vercel env vars.
 */

const ROOT_DOMAIN = "app.aceleradoradeventas.co";

// Switch to "subdomain" when upgrading to Vercel Pro
const WORKSPACE_MODE: "path" | "subdomain" =
  (import.meta.env.VITE_WORKSPACE_MODE as "path" | "subdomain") || "path";

/**
 * Returns the workspace slug from the current URL, or null if we're on the
 * root/main app URL.
 *
 * Path mode examples:
 *   "/w/cristhian-duran/..."  → "cristhian-duran"
 *   "/dashboard"              → null
 *
 * Subdomain mode examples:
 *   "cristhian.app.aceleradoradeventas.co" → "cristhian"
 *   "app.aceleradoradeventas.co"           → null
 *   "localhost"                            → null
 */
export function getWorkspaceSlug(): string | null {
  if (WORKSPACE_MODE === "subdomain") {
    const hostname = window.location.hostname;
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
    ) {
      return null;
    }
    if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
      return hostname.slice(0, hostname.length - ROOT_DOMAIN.length - 1);
    }
    return null;
  }

  // Path mode: /w/:slug
  const match = window.location.pathname.match(/^\/w\/([a-z0-9][a-z0-9-]*[a-z0-9])/);
  return match ? match[1] : null;
}

/**
 * Builds the full workspace URL for a given slug.
 * Path mode:      https://app.aceleradoradeventas.co/w/cristhian-duran
 * Subdomain mode: https://cristhian.app.aceleradoradeventas.co
 */
export function buildWorkspaceUrl(slug: string): string {
  if (WORKSPACE_MODE === "subdomain") {
    return `https://${slug}.${ROOT_DOMAIN}`;
  }
  return `https://${ROOT_DOMAIN}/w/${slug}`;
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
