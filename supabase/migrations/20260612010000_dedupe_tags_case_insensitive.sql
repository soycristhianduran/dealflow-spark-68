-- Clean up case-variant duplicate tags and enforce case-insensitive uniqueness.
--
-- Tags were seeded from two sources with different casing (contacts stored them
-- lowercased; automations stored them as typed), producing duplicates like
-- "reserva 54" vs "Reserva 54". Pick one canonical casing per (org, lower(name)),
-- rewrite contacts to it, drop the rest, and prevent future case duplicates.

-- Canonical name per (org, lower(name)): prefer a mixed/upper-case variant.
create temporary table _canon on commit drop as
  select organization_id,
         lower(name) as lname,
         (array_agg(name order by (name = lower(name)), name))[1] as keep
  from public.organization_tags
  group by organization_id, lower(name);

-- Rewrite contact tag arrays to the canonical casing (de-duped).
update public.contacts c
set tags = sub.new_tags
from (
  select c2.id,
         array_agg(distinct coalesce(_canon.keep, t.tag)) as new_tags
  from public.contacts c2
  cross join lateral unnest(c2.tags) as t(tag)
  left join _canon
    on _canon.organization_id = c2.organization_id
   and _canon.lname = lower(t.tag)
  where c2.organization_id is not null
  group by c2.id
) sub
where c.id = sub.id
  and c.tags is distinct from sub.new_tags;

-- Drop the non-canonical catalog rows.
delete from public.organization_tags ot
using _canon
where ot.organization_id = _canon.organization_id
  and lower(ot.name) = _canon.lname
  and ot.name <> _canon.keep;

-- Enforce case-insensitive uniqueness going forward.
create unique index if not exists organization_tags_org_lower_name_uidx
  on public.organization_tags (organization_id, lower(name));
