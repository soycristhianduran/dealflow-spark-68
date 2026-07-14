-- Seguridad: la tabla de depuración ig_oauth_debug tenía RLS deshabilitado y
-- quedaba accesible por la API pública (alerta de Supabase rls_disabled_in_public).
-- Solo la escribe la edge function instagram-oauth con service_role (que ignora
-- RLS), así que habilitar RLS sin políticas la cierra a los roles anon/authenticated
-- sin romper el logging.
alter table public.ig_oauth_debug enable row level security;
