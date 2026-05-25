-- Storage bucket for landing page image assets (hero images, logos, etc.)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'landing-assets',
  'landing-assets',
  true,
  5242880,  -- 5 MB
  array['image/jpeg','image/png','image/webp','image/gif','image/svg+xml']
)
on conflict (id) do nothing;

-- Authenticated users can upload
create policy if not exists "landing_assets_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'landing-assets');

-- Authenticated users can update/replace their uploads
create policy if not exists "landing_assets_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'landing-assets');

-- Everyone can read (public bucket)
create policy if not exists "landing_assets_select"
  on storage.objects for select to public
  using (bucket_id = 'landing-assets');
