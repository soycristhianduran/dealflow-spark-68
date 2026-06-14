-- Setter role: same permissions as a vendor, but tracked separately on leads so
-- the dashboard can measure who BOOKS appointments (setter) vs who CLOSES (vendor).

-- 1. Allow 'setter' as a member role.
alter table public.organization_members drop constraint if exists organization_members_role_check;
alter table public.organization_members add constraint organization_members_role_check
  check (role = any (array['owner','admin','vendor','setter','readonly','member']));

-- 2. Lead keeps both: setter_id (who booked) and owner_id (vendor who closes).
alter table public.contacts
  add column if not exists setter_id uuid references auth.users(id) on delete set null;
create index if not exists idx_contacts_setter_id on public.contacts(setter_id);
