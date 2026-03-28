-- Create storage bucket for canvas screenshots used by the screenshot_canvas tool.
-- Screenshots are temporary artifacts for the AI agent to inspect the canvas visually.
-- Public read so the agent can access screenshot URLs directly.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'canvases',
  'canvases',
  true,
  5242880, -- 5MB
  array['image/png']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Allow authenticated users to upload screenshots
drop policy if exists "canvases_insert_authenticated" on storage.objects;
create policy "canvases_insert_authenticated"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'canvases');

-- Allow public read access
drop policy if exists "canvases_select_public" on storage.objects;
create policy "canvases_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'canvases');
