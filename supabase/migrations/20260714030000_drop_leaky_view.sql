-- Seguridad: v_leads_needing_attention era SECURITY DEFINER, sin filtro de
-- organización y con GRANT SELECT a anon/authenticated → exponía leads de TODAS
-- las organizaciones a cualquiera con la anon key pública. No se usaba en el
-- código. Se elimina.
drop view if exists public.v_leads_needing_attention;
