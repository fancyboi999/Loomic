-- Add code_execution to the background job type enum
ALTER TYPE public.background_job_type ADD VALUE IF NOT EXISTS 'code_execution';

-- Create PGMQ queue for code execution jobs
SELECT pgmq.create('code_execution_jobs');
