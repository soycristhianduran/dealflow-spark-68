-- Base del % de conversión por vendedor en el dashboard.
--   'appointments' = ganados / citas (para negocios donde la conversión relevante
--     es de los que agendan cita, ej. BAJOXQBAJO).
--   'leads' (o NULL) = ganados / total de leads generados (comportamiento estándar).
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS vendor_conversion_base text;
