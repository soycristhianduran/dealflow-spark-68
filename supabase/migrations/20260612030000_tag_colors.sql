-- Per-tag color for the org tag catalog. Renders as colored chips in Leads,
-- Settings, and the tag dropdowns. Stored as a base hex color; the UI derives a
-- soft background from it.

alter table public.organization_tags add column if not exists color text;

-- Seed existing tags with a deterministic palette so they get colors immediately.
with palette as (
  select array[
    '#ef4444','#f97316','#eab308','#22c55e','#14b8a6',
    '#3b82f6','#6366f1','#a855f7','#ec4899','#64748b'
  ] as colors
),
numbered as (
  select id, (row_number() over (partition by organization_id order by name) - 1) as rn
  from public.organization_tags
  where color is null
)
update public.organization_tags ot
set color = (select colors[(n.rn % 10) + 1] from palette, numbered n where n.id = ot.id)
from numbered n
where n.id = ot.id and ot.color is null;
