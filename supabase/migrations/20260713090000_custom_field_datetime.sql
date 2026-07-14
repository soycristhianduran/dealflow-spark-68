-- Permitir el tipo "datetime" (fecha y hora) en los campos personalizados.
-- Antes solo se aceptaban text/number/date/select/boolean.
alter table public.custom_field_definitions
  drop constraint if exists custom_field_definitions_field_type_check;
alter table public.custom_field_definitions
  add constraint custom_field_definitions_field_type_check
  check (field_type = any (array['text','number','date','datetime','select','boolean']));
