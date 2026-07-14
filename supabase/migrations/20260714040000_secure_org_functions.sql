-- Seguridad: varias funciones SECURITY DEFINER que reciben un organization_id no
-- verificaban membresía y estaban ejecutables por PUBLIC (incluye anon). Un
-- atacante con la anon key pública podía leer datos de cualquier organización
-- (conversaciones, dashboards, miembros, etc.).
--
-- 1) wa_conversations: guarda de membresía (is_org_member) — cierra anon y el
--    acceso de un usuario logueado a otra organización.
-- 2) Se revoca EXECUTE de PUBLIC y se concede solo a authenticated (frontend) y
--    service_role (edge functions) en las funciones por-org.
-- 3) Las funciones exclusivas de servidor pierden también authenticated (quedan
--    solo para service_role).

-- (1) Guarda en wa_conversations: se añade `public.is_org_member(p_org)` al WHERE.
--     Ver definición completa en la migración de búsqueda; aquí solo se documenta;
--     el CREATE OR REPLACE con la guarda ya fue aplicado.

-- (2) Revocar de PUBLIC, conceder a authenticated + service_role.
do $rev$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and p.proname in (
      'wa_conversations','dashboard_ads_roas','dashboard_extra','dashboard_pipeline',
      'dashboard_ads_accounts','get_org_members','get_active_subscription','org_addon_extras',
      'whatsapp_campaign_stats','match_contact','assign_gestor_by_email','check_ai_agent_quota',
      'consume_ai_agent_session','consume_ai_assistant_quota','consume_ai_credit',
      'consume_automated_message_quota','consume_email_quota','dispatch_transactional_email',
      'log_ai_usage','merge_contacts','set_org_addon','start_internal_trial','wa_find_or_create_contact')
  loop
    execute format('revoke execute on function %s from public', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $rev$;

-- (3) Funciones exclusivas de servidor: quitar authenticated (solo service_role).
do $rev2$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and p.proname in (
      'match_contact','consume_ai_agent_session','check_ai_agent_quota','consume_ai_assistant_quota',
      'consume_ai_credit','consume_automated_message_quota','consume_email_quota','dispatch_transactional_email',
      'log_ai_usage','set_org_addon','start_internal_trial','wa_find_or_create_contact',
      'assign_gestor_by_email','org_addon_extras')
  loop
    execute format('revoke execute on function %s from authenticated', r.sig);
  end loop;
end $rev2$;
