-- Products / services catalog (per org) + the product sold on a won lead.
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  default_price numeric,
  currency text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.contacts
  add column if not exists won_product_id uuid references public.products(id) on delete set null;

alter table public.products enable row level security;
drop policy if exists products_org on public.products;
create policy products_org on public.products
  for all using (is_org_member(organization_id))
  with check (is_org_member(organization_id));

create index if not exists idx_products_org on public.products(organization_id) where is_active;
