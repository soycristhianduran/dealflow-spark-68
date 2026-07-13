-- Índice para acelerar (y bajar el Disk IO de) las consultas que filtran
-- actividades por su entidad: Timeline del lead y el conteo de "citas por etapa"
-- del dashboard (dashboard_extra / dashboard_ads_roas usan EXISTS sobre activities).
CREATE INDEX IF NOT EXISTS idx_activities_related_entity ON public.activities(related_entity_id);
