-- Permisos por miembro (estilo Kommo) + visibilidad de leads por defecto por org.
--
-- organization_members.permissions: jsonb con overrides por entidad/acción.
--   Ej: {"leads":{"view":"all","edit":"own","delete":"none"}}
--   NULL = usar los defaults del rol (comportamiento histórico intacto).
--
-- organizations.default_lead_visibility: 'all' hace que setters/vendedores vean
--   todos los leads de la org por defecto (sin override propio). NULL/'own' = solo
--   los suyos, como siempre.
ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS permissions jsonb;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS default_lead_visibility text;
