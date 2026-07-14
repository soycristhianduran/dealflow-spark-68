-- Búsqueda por CONTENIDO del chat en la lista de conversaciones (estilo WhatsApp):
-- además de nombre/teléfono/email, p_search ahora también trae los chats cuyos
-- MENSAJES contienen el término. Se resuelve con una sola pasada (CTE match_phones)
-- que queda vacía cuando no hay búsqueda, así que no añade costo al listado normal.
drop function if exists public.wa_conversations(uuid, integer, integer, text);

create or replace function public.wa_conversations(
  p_org uuid,
  p_limit integer default 500,
  p_offset integer default 0,
  p_search text default null
)
returns table(
  phone_number text, contact_id uuid, contact_name text, last_message text,
  last_message_type text, last_direction text, last_message_time timestamptz,
  from_phone_number_id text, unread_count bigint
)
language sql stable security definer set search_path to 'public'
as $fn$
  with
  match_phones as (
    select distinct phone_number
    from public.whatsapp_messages
    where organization_id = p_org
      and p_search is not null and p_search <> ''
      and message_text ilike '%'||p_search||'%'
  ),
  last_msg as (
    select distinct on (phone_number)
      phone_number, contact_id, message_text, message_type, direction, created_at, from_phone_number_id
    from public.whatsapp_messages
    where organization_id = p_org
    order by phone_number, created_at desc
  ),
  last_incoming as (
    select distinct on (phone_number) phone_number, from_phone_number_id
    from public.whatsapp_messages
    where organization_id = p_org and direction='incoming' and from_phone_number_id is not null
    order by phone_number, created_at desc
  ),
  unread as (
    select phone_number, count(*)::bigint c
    from public.whatsapp_messages
    where organization_id = p_org and direction='incoming' and read_at is null
    group by phone_number
  )
  select lm.phone_number, lm.contact_id,
    nullif(trim(coalesce(ct.first_name,'')||' '||coalesce(ct.last_name,'')), '') as contact_name,
    coalesce(nullif(lm.message_text,''), case when lm.message_type <> 'text' then '['||lm.message_type||']' else '' end),
    lm.message_type, lm.direction, lm.created_at,
    coalesce(li.from_phone_number_id, lm.from_phone_number_id),
    coalesce(u.c, 0)
  from last_msg lm
  left join last_incoming li on li.phone_number = lm.phone_number
  left join unread u on u.phone_number = lm.phone_number
  left join public.contacts ct on ct.id = lm.contact_id
  where p_search is null or p_search = '' or (
       lm.phone_number ilike '%'||p_search||'%'
    or coalesce(ct.first_name,'') ilike '%'||p_search||'%'
    or coalesce(ct.last_name,'')  ilike '%'||p_search||'%'
    or trim(coalesce(ct.first_name,'')||' '||coalesce(ct.last_name,'')) ilike '%'||p_search||'%'
    or coalesce(ct.primary_email,'') ilike '%'||p_search||'%'
    or lm.phone_number in (select phone_number from match_phones)
  )
  order by lm.created_at desc
  limit p_limit offset p_offset;
$fn$;
