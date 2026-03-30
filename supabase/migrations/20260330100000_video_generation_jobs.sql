-- Add video_generation to the background job type enum
ALTER TYPE public.background_job_type ADD VALUE IF NOT EXISTS 'video_generation';

-- Create PGMQ queue for video generation jobs
SELECT pgmq.create('video_generation_jobs');
