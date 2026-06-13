create or replace function public.whatsapp_campaign_stats(p_org uuid)
returns table(campaign_id uuid, sent int, delivered int, read_c int, failed int)
language sql security definer set search_path=public as $func$
  select campaign_id,
    count(*) filter (where status in ('sent','delivered','read'))::int,
    count(*) filter (where status in ('delivered','read'))::int,
    count(*) filter (where status = 'read')::int,
    count(*) filter (where status = 'failed')::int
  from whatsapp_sends
  where organization_id = p_org
  group by campaign_id;
$func$;
grant execute on function public.whatsapp_campaign_stats(uuid) to authenticated, service_role;
