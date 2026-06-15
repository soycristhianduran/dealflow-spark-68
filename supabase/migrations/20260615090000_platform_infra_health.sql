-- Extra infra metrics (storage, MAU) + integrations health for the platform monitor.

CREATE OR REPLACE FUNCTION public.platform_infra_extra()
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public, storage, auth
AS $$
  SELECT jsonb_build_object(
    'storage_bytes', (SELECT COALESCE(SUM((metadata->>'size')::bigint), 0) FROM storage.objects),
    'mau',          (SELECT COUNT(*) FROM auth.users WHERE last_sign_in_at >= date_trunc('month', now())),
    'total_users',  (SELECT COUNT(*) FROM auth.users)
  );
$$;
GRANT EXECUTE ON FUNCTION public.platform_infra_extra() TO service_role;

CREATE OR REPLACE FUNCTION public.platform_integrations_health()
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'whatsapp', jsonb_build_object(
      'total',           (SELECT COUNT(*) FROM whatsapp_configs),
      'active',          (SELECT COUNT(*) FROM whatsapp_configs WHERE is_active AND phone_number_id <> 'pending'),
      'webhook_ok',      (SELECT COUNT(*) FROM whatsapp_configs WHERE webhook_verified)
    ),
    'instagram', jsonb_build_object(
      'total',           (SELECT COUNT(*) FROM instagram_accounts),
      'active',          (SELECT COUNT(*) FROM instagram_accounts WHERE is_active),
      'needs_reconnect', (SELECT COUNT(*) FROM instagram_accounts WHERE needs_reconnect OR last_refresh_error IS NOT NULL)
    ),
    'google_calendar', jsonb_build_object(
      'connected',       (SELECT COUNT(*) FROM google_calendar_tokens)
    ),
    'voice_vapi', jsonb_build_object(
      'total',           (SELECT COUNT(*) FROM vapi_configs),
      'active',          (SELECT COUNT(*) FROM vapi_configs WHERE is_active)
    ),
    'meta_ads', jsonb_build_object(
      'orgs_connected',  (SELECT COUNT(DISTINCT organization_id) FROM meta_campaigns)
    )
  );
$$;
GRANT EXECUTE ON FUNCTION public.platform_integrations_health() TO service_role;
