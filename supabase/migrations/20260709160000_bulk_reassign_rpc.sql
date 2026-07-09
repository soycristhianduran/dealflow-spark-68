-- Bulk lead reassignment in ONE transaction (applied live 2026-07-09).
-- The UI used to loop 4 sequential HTTP updates per 100-lead batch (owner,
-- WhatsApp history, IG conversations, IG messages) — minutes on a 10k
-- selection. This RPC does it all server-side in a single round-trip.
create or replace function public.bulk_reassign_contacts(p_org uuid, p_ids uuid[], p_owner uuid)
returns integer language plpgsql security definer set search_path to 'public' as $fn$
declare v_count int;
begin
  -- Caller must belong to the org; target must be a member of it too.
  if not is_org_member(p_org) then raise exception 'forbidden'; end if;
  if not exists (select 1 from organization_members where organization_id = p_org and user_id = p_owner) then
    raise exception 'target_not_member';
  end if;
  update contacts set owner_id = p_owner
   where organization_id = p_org and id = any(p_ids);
  get diagnostics v_count = row_count;
  update whatsapp_messages set user_id = p_owner
   where organization_id = p_org and contact_id = any(p_ids);
  update instagram_conversations set user_id = p_owner
   where organization_id = p_org and contact_id = any(p_ids);
  update instagram_messages m set user_id = p_owner
   from instagram_conversations c
   where c.id = m.conversation_id and c.organization_id = p_org and c.contact_id = any(p_ids);
  return v_count;
end $fn$;

grant execute on function public.bulk_reassign_contacts(uuid, uuid[], uuid) to authenticated;
