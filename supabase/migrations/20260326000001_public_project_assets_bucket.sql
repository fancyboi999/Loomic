-- Make project-assets bucket publicly accessible.
-- This enables permanent public URLs (no signed URL expiry),
-- which is required for multimodal AI chat and future sharing features.
UPDATE storage.buckets SET public = true WHERE id = 'project-assets';
