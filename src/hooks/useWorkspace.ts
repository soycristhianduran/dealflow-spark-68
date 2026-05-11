/**
 * useWorkspace — returns the current workspace slug and a helper to build
 * slug-prefixed paths.
 *
 * Priority:
 *  1. :slug URL param (when inside /w/:slug/* routes)
 *  2. organization.slug from context (fallback for old routes)
 *
 * Usage:
 *   const { slug, path } = useWorkspace();
 *   navigate(path("/contacts"));  // → /w/mtc/contacts
 *   <NavLink to={path("/")} />    // → /w/mtc
 */
import { useParams } from "react-router-dom";
import { useOrganizationContext } from "@/context/OrganizationContext";

export function useWorkspace() {
  const { slug: urlSlug } = useParams<{ slug?: string }>();
  const { organization } = useOrganizationContext();

  const slug = urlSlug || organization?.slug || null;
  const prefix = slug ? `/w/${slug}` : "";

  /** Builds a full path prefixed with the workspace slug. */
  const path = (route: string) => `${prefix}${route === "/" ? "" : route}`;

  return { slug, prefix, path };
}
