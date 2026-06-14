-- Persist the organization's default currency (the Settings selector was cosmetic).
alter table public.organizations
  add column if not exists default_currency text not null default 'USD';
