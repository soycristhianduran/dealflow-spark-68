-- Add slug column to organizations for workspace URL personalization.
-- Each organization can set a unique slug (e.g. "miempresa") which becomes
-- their workspace address: miempresa.app.aceleradoradeventas.co

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Index for fast lookups by slug (used on every page load when subdomain routing is active)
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- Auto-generate slugs for existing organizations from their name
UPDATE organizations
SET slug = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      UNACCENT(COALESCE(name, 'workspace')),
      '[^a-zA-Z0-9\s-]', '', 'g'   -- remove special chars
    ),
    '\s+', '-', 'g'                  -- spaces → hyphens
  )
)
WHERE slug IS NULL;

-- If there are collisions after the auto-generation, append the first 4 chars of the org id
UPDATE organizations o
SET slug = o.slug || '-' || SUBSTRING(o.id::text, 1, 4)
WHERE (
  SELECT COUNT(*) FROM organizations o2 WHERE o2.slug = o.slug AND o2.id != o.id
) > 0;
