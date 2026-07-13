-- Alcance del calendario de la organización.
--   'organization' = calendario global: todo el equipo ve todas las citas.
--   'individual' (o NULL) = cada usuario ve solo las suyas (admins ven todo).
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS calendar_scope text;
