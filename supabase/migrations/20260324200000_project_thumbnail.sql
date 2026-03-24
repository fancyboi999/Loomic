-- Add thumbnail storage path to projects table.
-- The path references an object in the project-assets Supabase Storage bucket.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS thumbnail_path text;

COMMENT ON COLUMN public.projects.thumbnail_path IS
  'Storage object path for the project canvas thumbnail (in project-assets bucket)';
