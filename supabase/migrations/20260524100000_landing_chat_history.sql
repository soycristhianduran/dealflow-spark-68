-- Add chat_history column to persist the AI chat conversation per landing page
alter table landing_pages
  add column if not exists chat_history jsonb default '[]'::jsonb;
