-- Brand Kit file storage bucket + RLS policies.
-- Path pattern: {user_id}/{kit_id}/{timestamp}-{filename}
-- First folder = user_id, enforced by RLS.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-kit-assets',
  'brand-kit-assets',
  false,
  10485760, -- 10 MB
  array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- INSERT: user can upload to their own folder
create policy "brand_kit_assets_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'brand-kit-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- SELECT: user can read their own files
create policy "brand_kit_assets_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'brand-kit-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- UPDATE: user can update their own files
create policy "brand_kit_assets_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'brand-kit-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'brand-kit-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- DELETE: user can delete their own files
create policy "brand_kit_assets_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'brand-kit-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);
