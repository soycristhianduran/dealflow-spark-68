-- rename_org_tag(org, old, new): rename a tag everywhere it's used, atomically.
-- Updates the catalog, every contact's tags array, and automation steps/triggers
-- that reference the tag, so a rename doesn't leave stragglers (and automations
-- don't re-create the old tag on their next run).

create or replace function public.rename_org_tag(p_org_id uuid, p_old text, p_new text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Authorization: caller must be a member of the org.
  if not exists (
    select 1 from public.organization_members
    where organization_id = p_org_id and user_id = auth.uid()
  ) then
    raise exception 'not authorized for this organization';
  end if;

  p_new := trim(p_new);
  if p_new = '' then raise exception 'tag name cannot be empty'; end if;
  if p_old = p_new then return; end if;

  -- Reject if a DIFFERENT tag already uses the new name (case-insensitive).
  if exists (
    select 1 from public.organization_tags
    where organization_id = p_org_id
      and lower(name) = lower(p_new)
      and lower(name) <> lower(p_old)
  ) then
    raise exception 'a tag with that name already exists';
  end if;

  -- 1) Catalog
  update public.organization_tags
  set name = p_new
  where organization_id = p_org_id and name = p_old;

  -- 2) Contacts' tag arrays (replace old → new, de-duped)
  update public.contacts c
  set tags = (
    select array_agg(distinct case when t.tag = p_old then p_new else t.tag end)
    from unnest(c.tags) as t(tag)
  )
  where c.organization_id = p_org_id and c.tags @> array[p_old];

  -- 3) Automation steps (add_tag / remove_tag)
  update public.automations a
  set steps = (
    select jsonb_agg(
      case when (s->>'type') in ('add_tag','remove_tag') and (s->'config'->>'tag') = p_old
           then jsonb_set(s, '{config,tag}', to_jsonb(p_new))
           else s end
    )
    from jsonb_array_elements(a.steps) s
  )
  where a.organization_id = p_org_id and jsonb_typeof(a.steps) = 'array';

  -- 4) Automation multi-triggers array (tag_added)
  update public.automations a
  set triggers = (
    select jsonb_agg(
      case when (tr->>'type') = 'tag_added' and (tr->'config'->>'tag') = p_old
           then jsonb_set(tr, '{config,tag}', to_jsonb(p_new))
           else tr end
    )
    from jsonb_array_elements(a.triggers) tr
  )
  where a.organization_id = p_org_id and jsonb_typeof(a.triggers) = 'array';

  -- 5) Legacy single trigger_config (tag_added)
  update public.automations a
  set trigger_config = jsonb_set(a.trigger_config, '{tag}', to_jsonb(p_new))
  where a.organization_id = p_org_id
    and a.trigger_type = 'tag_added'
    and (a.trigger_config->>'tag') = p_old;
end;
$$;

grant execute on function public.rename_org_tag(uuid, text, text) to authenticated, service_role;
